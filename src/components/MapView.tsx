import { MapContainer, ImageOverlay, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import type { Member } from "../api-client";
import { positionForMiles } from "../../shared/progress";
import { ROUTE as ROUTE_WAYPOINTS } from "../../shared/route";
import { CHARACTERS, DEFAULT_COLOR } from "../../shared/characters";
import mapUrl from "../assets/map.png";

const HEIGHT = 1672;
const WIDTH = 941;
const bounds: L.LatLngBoundsExpression = [[0, 0], [HEIGHT, WIDTH]];
const CHAR_W = 46;
const CHAR_H = 69; // 2:3, matches the 1024x1536 sprite art
const ANIM_MS = 4500;

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

// The route from the start up to `miles`, as lat/lng points, nudged sideways by
// offsetX so each runner's trail reads as its own parallel ribbon.
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

function RunnerOverlay({ member, miles }: { member: Member; miles: number }) {
  const map = useMap();
  const p = positionForMiles(miles, ROUTE_WAYPOINTS);
  const lat = latFor(p.y);
  const lng = p.x;
  const overlayBounds: L.LatLngBoundsExpression = [
    [lat, lng - CHAR_W / 2],
    [lat + CHAR_H, lng + CHAR_W / 2],
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

const LANDMARKS = ROUTE_WAYPOINTS.filter((w) => w.isLandmark);

function labelIcon(name: string) {
  return L.divIcon({
    className: "landmark-label",
    html: `<span>${name}</span>`,
    iconSize: [140, 0],
    iconAnchor: [70, -8],
  });
}

const fellowshipIcon = L.divIcon({
  html: "⭐",
  className: "fellowship-marker",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

// Cover-fit for a given viewport size: the zoom that fills the screen and the
// center latitude that pins the map's TOP edge to the top of the viewport.
function coverView(vw: number, vh: number): { center: [number, number]; zoom: number } {
  const scale = Math.max(vw / WIDTH, vh / HEIGHT); // fill whichever dimension needs it
  const zoom = Math.log2(scale);
  const halfLat = vh / 2 / scale;
  return { center: [HEIGHT - halfLat, WIDTH / 2], zoom };
}

// Re-pin on window resize only. The INITIAL view is set directly on the
// MapContainer (below) so there is no post-mount view jump — which is what
// desynced the marker layer from the map image on wide (desktop) screens.
function FitCover() {
  const map = useMap();
  useEffect(() => {
    const onResize = () => {
      map.invalidateSize(false);
      const size = map.getSize();
      if (!size.x || !size.y) return;
      const { center, zoom } = coverView(size.x, size.y);
      map.setMinZoom(zoom);
      map.setMaxZoom(zoom + 4);
      map.setView(center, zoom, { animate: false });
    };
    map.on("resize", onResize);
    return () => {
      map.off("resize", onResize);
    };
  }, [map]);
  return null;
}

function FocusFlyer({ members, focus }: { members: Member[]; focus: MapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    const m = members.find((x) => x.id === focus.id);
    if (!m) return;
    const p = positionForMiles(m.totalMiles, ROUTE_WAYPOINTS);
    map.flyTo([latFor(p.y), p.x], Math.max(map.getZoom(), map.getMinZoom() + 1.6), { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);
  return null;
}

export function MapView({
  members,
  fellowshipMiles,
  focus,
}: {
  members: Member[];
  fellowshipMiles: number;
  focus: MapFocus | null;
}) {
  // Intro animation: everyone starts at mile 0 and eases out to their position.
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const e = Math.min(1, (now - start) / ANIM_MS);
      setT(easeInOutCubic(e));
      if (e < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const count = members.length;
  const fPos = positionForMiles(fellowshipMiles * t, ROUTE_WAYPOINTS);

  // Compute the cover-fit view from the current window size BEFORE the map
  // mounts, so the image and all markers share one consistent initial view.
  const initial = useMemo(() => coverView(window.innerWidth, window.innerHeight), []);

  return (
    <MapContainer
      crs={L.CRS.Simple}
      center={initial.center}
      zoom={initial.zoom}
      minZoom={initial.zoom}
      maxZoom={initial.zoom + 4}
      maxBounds={bounds}
      maxBoundsViscosity={1.0}
      zoomSnap={0}
      style={{ height: "100vh", width: "100vw", background: "#000" }}
    >
      <FitCover />
      <FocusFlyer members={members} focus={focus} />
      <ImageOverlay url={mapUrl} bounds={bounds} zIndex={0} />

      {members.map((m, i) => {
        const offsetX = (i - (count - 1) / 2) * 8;
        const color = m.color ?? DEFAULT_COLOR;
        return (
          <Polyline
            key={`trail-${m.id}`}
            positions={trailPoints(m.totalMiles * t, offsetX)}
            pathOptions={{ color, weight: 3, opacity: 0.55, lineCap: "round", lineJoin: "round" }}
          />
        );
      })}

      {LANDMARKS.map((w) => (
        <Marker
          key={`label-${w.landmarkId}`}
          position={[latFor(w.y), w.x]}
          icon={labelIcon(w.name)}
          interactive={false}
          zIndexOffset={-100}
        />
      ))}

      {members.map((m) => (
        <RunnerOverlay key={m.id} member={m} miles={m.totalMiles * t} />
      ))}

      <Marker position={[latFor(fPos.y), fPos.x]} icon={fellowshipIcon}>
        <Popup>The Fellowship — {Math.round(fellowshipMiles)} mi</Popup>
      </Marker>
    </MapContainer>
  );
}
