/* global maplibregl, turf */
const MAPTILER_KEY = "zouFxW02vyhPO2yBO8SN";
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
const GEOJSON_URL = "/data/mappychange_walthamstow.geojson";
const FORM_URL = "https://forms.gle/VUFTbD6G8dLh2DrD7";
const MARKER_ICON = "/assets/pin.png";

// Init map
const map = new maplibregl.Map({
  container: "map",
  style: STYLE_URL,
  center: [-0.0197, 51.5856],
  zoom: 13
});
map.addControl(new maplibregl.NavigationControl());

// Load data
async function fetchGeoJSON() {
  const res = await fetch(GEOJSON_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("GeoJSON missing");
  return await res.json();
}

// Add "Use my location"
document.getElementById("locate").addEventListener("click", () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      map.flyTo({ center: [longitude, latitude], zoom: 14 });
      updateCards([longitude, latitude]);
    });
  }
});

// Open suggestion form
document.getElementById("fab-suggest").addEventListener("click", () =>
  window.open(FORM_URL, "_blank")
);

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

  // Cluster count
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "places",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12
    },
    paint: { "text-color": "#fff" }
  });

  // Unclustered pins
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
    }
  });

  // 👉 Cluster click behaviour
  map.on("click", "clusters", (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
    const clusterId = features[0].properties.cluster_id;
    map.getSource("places").getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom: zoom
      });
    });
  });

  map.on("mouseenter", "clusters", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; });

  // Pin click = recenter & show cards
  map.on("click", "unclustered", (e) => {
    const coords = e.features[0].geometry.coordinates;
    map.flyTo({ center: coords, zoom: 16 });
    updateCards(coords);
  });
});

// --- Card rendering ---
function updateCards(centerCoords) {
  fetch(GEOJSON_URL)
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById("results");
      container.innerHTML = "";

      // Sort by nearest
      const sorted = data.features
        .map(f => {
          return {
            ...f,
            dist: turf.distance(centerCoords, f.geometry.coordinates)
          };
        })
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);

      // Render cards
      sorted.forEach(f => {
        const props = f.properties;
        const card = document.createElement("div");
        card.className = "place-card";
        card.innerHTML = `
          <div class="card-header">
            <img src="${MARKER_ICON}" alt="pin" class="card-pin"/>
            <h3>${props.name}</h3>
          </div>
          <p class="address">${props.address || ""}</p>
          <p class="category">${props.category || ""}</p>
          <small>${f.dist.toFixed(2)} km away</small>
        `;
        container.appendChild(card);
      });
    });
}
