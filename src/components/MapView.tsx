import { MapContainer, ImageOverlay, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Member } from "../api-client";
import { positionForMiles } from "../../shared/progress";
import { ROUTE as ROUTE_WAYPOINTS } from "../../shared/route";
import { CHARACTERS } from "../../shared/characters";
import mapUrl from "../assets/map.png";

const HEIGHT = 1672;
const WIDTH = 941;
const bounds: L.LatLngBoundsExpression = [[0, 0], [HEIGHT, WIDTH]];

function spriteFor(character: string | null): string {
  return CHARACTERS.find((c) => c.key === character)?.sprite ?? "/sprites/frodo.png";
}

function spriteIcon(url: string) {
  return L.icon({ iconUrl: url, iconSize: [24, 24], className: "runner-sprite", iconAnchor: [12, 12] });
}

const fellowshipIcon = L.divIcon({ html: "⭐", className: "fellowship-marker", iconSize: [24, 24] });

export function MapView({ members, fellowshipMiles }: { members: Member[]; fellowshipMiles: number }) {
  const fellowshipPos = positionForMiles(fellowshipMiles, ROUTE_WAYPOINTS);
  return (
    <MapContainer crs={L.CRS.Simple} bounds={bounds} minZoom={-2} maxZoom={2}
      style={{ height: "100vh", width: "100vw" }}>
      <ImageOverlay url={mapUrl} bounds={bounds} />
      {members.map((m) => {
        const p = positionForMiles(m.totalMiles, ROUTE_WAYPOINTS);
        return (
          <Marker key={m.id} position={[p.y, p.x]} icon={spriteIcon(spriteFor(m.chosenCharacter))}>
            <Popup>{m.displayName} — {Math.round(m.totalMiles)} mi</Popup>
          </Marker>
        );
      })}
      <Marker position={[fellowshipPos.y, fellowshipPos.x]} icon={fellowshipIcon}>
        <Popup>The Fellowship — {Math.round(fellowshipMiles)} mi</Popup>
      </Marker>
    </MapContainer>
  );
}
