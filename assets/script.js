const MAPTILER_KEY = "zouFxW02vyhPO2yBO8SN";
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
const GEOJSON_URL = "/data/mappychange_walthamstow.geojson";
const FORM_URL = "https://forms.gle/VUFTbD6G8dLh2DrD7";
const DEFAULT_BOUNDS = [[-0.064, 51.556], [0.028, 51.615]];
const MARKER_ICON = "/assets/pin.png";

const map = new maplibregl.Map({
  container: "map",
  style: STYLE_URL,
  bounds: DEFAULT_BOUNDS
});
map.addControl(new maplibregl.NavigationControl());

// GeoJSON fetcher
async function fetchGeoJSON() {
  try {
    const res = await fetch(GEOJSON_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch (err) {
    console.warn("GeoJSON missing, using sample data. Reason:", err.message);
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-0.0197, 51.5856] },
          properties: {
            name: "Test Hall",
            address: "Test Road, E17",
            category: "Test"
          }
        }
      ]
    };
  }
}

// Geolocation button
document.getElementById("locate").addEventListener("click", () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      map.flyTo({ center: [longitude, latitude], zoom: 14 });
    });
  }
});

// Suggest button → Google Form
document
  .getElementById("fab-suggest")
  .addEventListener("click", () => window.open(FORM_URL, "_blank"));

map.on("load", async () => {
  const data = await fetchGeoJSON();

  map.addSource("places", {
    type: "geojson",
    data,
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 14
  });

  // Cluster circles
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "places",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#111",
      "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 25, 28],
      "circle-stroke-color": "#ffd300",
      "circle-stroke-width": 2
    }
  });

  // Cluster labels
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "places",
    filter: ["has", "point_count"],
    layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
    paint: { "text-color": "#fff" }
  });

  // Shadow under pins
  map.addLayer({
    id: "unclustered-shadow",
    type: "circle",
    source: "places",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "rgba(0,0,0,0.18)",
      "circle-radius": 10,
      "circle-blur": 0.6
    }
  });

  // Custom pin image
  map.loadImage(MARKER_ICON, (error, image) => {
    if (!error && image) {
      if (!map.hasImage("custom-pin")) map.addImage("custom-pin", image);
      map.addLayer({
        id: "unclustered",
        type: "symbol",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": "custom-pin",
          "icon-size": 0.06,
          "icon-allow-overlap": true
        }
      });
    } else {
      console.warn("Custom pin not found, fallback to circle markers.");
      map.addLayer({
        id: "unclustered",
        type: "circle",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#ffd300",
          "circle-radius": 8,
          "circle-stroke-color": "#111",
          "circle-stroke-width": 2
        }
      });
    }
  });

  // ✅ Popups for unclustered points
  map.on("click", "unclustered", (e) => {
    const coords = e.features[0].geometry.coordinates.slice();
    const props = e.features[0].properties;

    const popupHtml = `
      <strong>${props.name || "Unnamed"}</strong><br>
      ${props.address || ""}<br>
      <em>${props.category || ""}</em>
    `;

    new maplibregl.Popup()
      .setLngLat(coords)
      .setHTML(popupHtml)
      .addTo(map);
  });

  // Cursor pointer on hover
  map.on("mouseenter", "unclustered", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "unclustered", () => {
    map.getCanvas().style.cursor = "";
  });
});
