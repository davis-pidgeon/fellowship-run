import { MapContainer, ImageOverlay, Marker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import type { Member } from "../api-client";
import { positionForMiles } from "../../shared/progress";
import { ROUTE as ROUTE_WAYPOINTS } from "../../shared/route";
import { CHARACTERS, DEFAULT_COLOR } from "../../shared/characters";
import mapUrl from "../assets/map.png";

const HEIGHT = 1672;
const WIDTH = 941;
const bounds: L.LatLngBoundsExpression = [[0, 0], [HEIGHT, WIDTH]];

// Character size in MAP units, so sprites scale WITH the map when zooming.
const CHAR_W = 46;
const CHAR_H = 69; // 2:3, matches the 1024x1536 sprite art

function spriteFor(character: string | null): string {
  return CHARACTERS.find((c) => c.key === character)?.sprite ?? "/sprites/frodo.png";
}

// Leaflet CRS.Simple counts latitude UPWARD; image pixels count y DOWNWARD.
// Convert an image-pixel y to the matching map latitude so markers land on
// the correct spot (Shire at the top, Mount Doom at the bottom).
function latFor(imgY: number): number {
  return HEIGHT - imgY;
}

function RunnerOverlay({ member }: { member: Member }) {
  const map = useMap();
  const p = positionForMiles(member.totalMiles, ROUTE_WAYPOINTS);
  const lat = latFor(p.y);
  const lng = p.x;
  // Feet at the route point, standing upright (head toward higher latitude).
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

const fellowshipIcon = L.divIcon({
  html: "⭐",
  className: "fellowship-marker",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

// Lock the view to the map: cover the whole screen (no empty margins), never
// zoom out past that, and never pan off the map. Re-applies on window resize.
function FitCover() {
  const map = useMap();
  useEffect(() => {
    const b = L.latLngBounds([[0, 0], [HEIGHT, WIDTH]]);
    const apply = () => {
      const cover = map.getBoundsZoom(b, true); // inside=true => cover the viewport
      map.setMinZoom(cover);
      if (map.getZoom() < cover) map.setZoom(cover);
    };
    apply();
    // Begin the journey at the Shire (top of the map).
    map.setView([latFor(130), 465], Math.max(map.getZoom(), map.getMinZoom()));
    map.on("resize", apply);
    return () => {
      map.off("resize", apply);
    };
  }, [map]);
  return null;
}

export function MapView({ members, fellowshipMiles }: { members: Member[]; fellowshipMiles: number }) {
  const fPos = positionForMiles(fellowshipMiles, ROUTE_WAYPOINTS);
  return (
    <MapContainer
      crs={L.CRS.Simple}
      bounds={bounds}
      maxBounds={bounds}
      maxBoundsViscosity={1.0}
      zoomSnap={0}
      maxZoom={5}
      style={{ height: "100vh", width: "100vw", background: "#000" }}
    >
      <FitCover />
      <ImageOverlay url={mapUrl} bounds={bounds} zIndex={0} />
      {members.map((m) => (
        <RunnerOverlay key={m.id} member={m} />
      ))}
      <Marker position={[latFor(fPos.y), fPos.x]} icon={fellowshipIcon}>
        <Popup>The Fellowship — {Math.round(fellowshipMiles)} mi</Popup>
      </Marker>
    </MapContainer>
  );
}
