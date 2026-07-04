import { MapContainer, ImageOverlay, Marker, Popup, Polyline, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import type { Member } from "../api-client";
import { positionForMiles } from "../../shared/progress";
import { ROUTE as ROUTE_WAYPOINTS } from "../../shared/route";
import { CHARACTERS, DEFAULT_COLOR } from "../../shared/characters";
import { SIDE_QUESTS, type SideQuest } from "../../shared/sidequests";
import mapUrl from "../assets/map.png";

const HEIGHT = 1086;
const WIDTH = 1448;
const bounds: L.LatLngBoundsExpression = [[0, 0], [HEIGHT, WIDTH]];
const CHAR_W = 46;
const CHAR_H = 69; // 2:3, matches the sprite art
// The sprite art has ~36% empty space below the character's feet; drop the box
// by that fraction so the feet (not the transparent box bottom) sit on the path.
const FOOT_FRAC = 0.36;
const QUEST_W = 50;
const QUEST_H = 28; // envelope aspect
const ANIM_MS = 4500;
const ZOOM_IN = 0.8; // zoom in past "cover" so the follow view feels close
// Sideways nudge per runner so trails read as parallel ribbons AND clustered
// characters fan out enough to tell apart — each character shares its trail's
// offset so the trail runs straight up into the character's feet.
const STAGGER = 11;

export interface MapFocus {
  id: string;
  nonce: number;
}

function spriteFor(character: string | null): string {
  return CHARACTERS.find((c) => c.key === character)?.sprite ?? "/sprites/frodo.png";
}

// CRS.Simple counts latitude UPWARD; image pixels count y DOWNWARD.
function latFor(imgY: number): number {
  return HEIGHT - imgY;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// The zoom at which the map just covers the viewport (never zoom out past this).
function coverZoomFor(vw: number, vh: number): number {
  return Math.log2(Math.max(vw / WIDTH, vh / HEIGHT));
}

// The route from the start up to `miles`, as lat/lng points, nudged sideways so
// each runner's trail reads as its own parallel ribbon over the drawn path.
function trailPoints(miles: number, offsetX: number): L.LatLngExpression[] {
  const pts: L.LatLngExpression[] = [];
  for (const w of ROUTE_WAYPOINTS) {
    if (w.cumulativeMiles <= miles) pts.push([latFor(w.y), w.x + offsetX]);
    else break;
  }
  const p = positionForMiles(miles, ROUTE_WAYPOINTS);
  pts.push([latFor(p.y), p.x + offsetX]);
  return pts;
}

function RunnerOverlay({ member, miles, offsetX }: { member: Member; miles: number; offsetX: number }) {
  const map = useMap();
  const p = positionForMiles(miles, ROUTE_WAYPOINTS);
  const lat = latFor(p.y);
  const lng = p.x + offsetX;
  const footLat = lat - FOOT_FRAC * CHAR_H; // feet land on the path, not the box
  const overlayBounds: L.LatLngBoundsExpression = [
    [footLat, lng - CHAR_W / 2],
    [footLat + CHAR_H, lng + CHAR_W / 2],
  ];
  const color = member.color ?? DEFAULT_COLOR;
  return (
    <ImageOverlay
      url={spriteFor(member.chosenCharacter)}
      bounds={overlayBounds}
      zIndex={650}
      interactive
      eventHandlers={{
        add: (e) => {
          const el = (e.target as L.ImageOverlay).getElement();
          if (el) {
            el.style.imageRendering = "pixelated";
            el.style.filter =
              `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 2px ${color}) ` +
              `drop-shadow(0 0 4px ${color}) drop-shadow(0 2px 2px rgba(0,0,0,0.55))`;
          }
        },
        click: (e) => {
          L.popup()
            .setLatLng(e.latlng)
            .setContent(`${member.displayName} — ${Math.round(member.totalMiles)} mi`)
            .openOn(map);
        },
      }}
    />
  );
}

function QuestOverlay({ quest, onOpen }: { quest: SideQuest; onOpen: (q: SideQuest) => void }) {
  const lat = latFor(quest.y);
  const b: L.LatLngBoundsExpression = [
    [lat - QUEST_H / 2, quest.x - QUEST_W / 2],
    [lat + QUEST_H / 2, quest.x + QUEST_W / 2],
  ];
  return (
    <ImageOverlay
      url="/envelope.png"
      bounds={b}
      zIndex={640}
      interactive
      eventHandlers={{
        add: (e) => {
          const el = (e.target as L.ImageOverlay).getElement();
          if (el) {
            el.style.imageRendering = "pixelated";
            el.style.filter = "drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff) drop-shadow(0 0 2px #fff)";
            el.style.cursor = "pointer";
          }
        },
        click: () => onOpen(quest),
      }}
    />
  );
}

const fellowshipIcon = L.icon({
  iconUrl: "/ring.png",
  iconSize: [56, 56],
  iconAnchor: [28, 28],
  className: "fellowship-ring",
});

// Keep the min zoom at "cover" on resize so the map never shows empty margins.
function FitCover() {
  const map = useMap();
  useEffect(() => {
    const onResize = () => {
      map.invalidateSize(false);
      const size = map.getSize();
      if (!size.x || !size.y) return;
      map.setMinZoom(coverZoomFor(size.x, size.y));
    };
    map.on("resize", onResize);
    return () => {
      map.off("resize", onResize);
    };
  }, [map]);
  return null;
}

// During the intro, follow the runner along the path.
function CameraFollow({ targetMiles, following }: { targetMiles: number; following: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!following) return;
    const p = positionForMiles(targetMiles, ROUTE_WAYPOINTS);
    map.panTo([latFor(p.y), p.x], { animate: false });
  }, [targetMiles, following, map]);
  return null;
}

function NavWatcher({ onNavigate }: { onNavigate: () => void }) {
  useMapEvents({
    dragstart: () => onNavigate(),
    zoomstart: () => onNavigate(),
  });
  return null;
}

function FocusFlyer({ members, focus }: { members: Member[]; focus: MapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    const m = members.find((x) => x.id === focus.id);
    if (!m) return;
    const p = positionForMiles(m.totalMiles, ROUTE_WAYPOINTS);
    map.flyTo([latFor(p.y), p.x], Math.max(map.getZoom(), map.getMinZoom() + 1.4), { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);
  return null;
}

export function MapView({
  members,
  fellowshipMiles,
  focus,
  myMiles,
  onOpenQuest,
  onNavigate,
}: {
  members: Member[];
  fellowshipMiles: number;
  focus: MapFocus | null;
  myMiles: number;
  onOpenQuest: (q: SideQuest) => void;
  onNavigate: () => void;
}) {
  const [t, setT] = useState(0);
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const e = Math.min(1, (now - start) / ANIM_MS);
      setT(easeInOutCubic(e));
      if (e < 1) raf = requestAnimationFrame(tick);
      else setFollowing(false); // intro done — hand control to the user
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const count = members.length;
  const fPos = positionForMiles(fellowshipMiles * t, ROUTE_WAYPOINTS);

  // Open zoomed-in at the Shire; the camera follows from there during the intro.
  // minZoom = cover so the user can zoom back out to see the whole map.
  const initial = useMemo(() => {
    const cover = coverZoomFor(window.innerWidth, window.innerHeight);
    const shire = ROUTE_WAYPOINTS[0];
    return { center: [latFor(shire.y), shire.x] as [number, number], cover, zoom: cover + ZOOM_IN };
  }, []);

  return (
    <MapContainer
      crs={L.CRS.Simple}
      center={initial.center}
      zoom={initial.zoom}
      minZoom={initial.cover}
      maxZoom={initial.zoom + 3}
      maxBounds={bounds}
      maxBoundsViscosity={1.0}
      zoomSnap={0}
      style={{ height: "100vh", width: "100vw", background: "#000" }}
    >
      <FitCover />
      <NavWatcher onNavigate={onNavigate} />
      <CameraFollow targetMiles={myMiles * t} following={following} />
      <FocusFlyer members={members} focus={focus} />
      <ImageOverlay url={mapUrl} bounds={bounds} zIndex={0} />

      {members.map((m, i) => {
        const offsetX = (i - (count - 1) / 2) * STAGGER;
        const color = m.color ?? DEFAULT_COLOR;
        return (
          <Polyline
            key={`trail-${m.id}`}
            positions={trailPoints(m.totalMiles * t, offsetX)}
            pathOptions={{ color, weight: 3, opacity: 0.55, lineCap: "round", lineJoin: "round" }}
          />
        );
      })}

      {members.map((m, i) => (
        <RunnerOverlay key={m.id} member={m} miles={m.totalMiles * t} offsetX={(i - (count - 1) / 2) * STAGGER} />
      ))}

      {SIDE_QUESTS.filter((q) => q.revealMiles <= myMiles).map((q) => (
        <QuestOverlay key={q.id} quest={q} onOpen={onOpenQuest} />
      ))}

      <Marker position={[latFor(fPos.y), fPos.x]} icon={fellowshipIcon}>
        <Popup>The Fellowship — {Math.round(fellowshipMiles)} mi</Popup>
      </Marker>
    </MapContainer>
  );
}
