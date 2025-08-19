// assets/script.js

const MAPTILER_KEY = "zouFxW02vyhPO2yBO8SN";
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
const GEOJSON_URL = "data/mappychange_walthamstow.geojson"; // relative path
const FORM_URL = "https://forms.gle/VUFTbD6G8dLh2DrD7";
const DEFAULT_BOUNDS = [[-0.064, 51.556], [0.028, 51.615]];
const MARKER_ICON = "assets/pin.png"; // ✅ FIXED relative path

// Init map
const map = new maplibregl.Map({
  container: "map",
  style: STYLE_URL,
  bounds: DEFAULT_BOUNDS,
});
map.addControl(new maplibregl.NavigationControl());

// Load GeoJSON
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
          properties: { name: "Test Hall", address: "Test Road, E17" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-0.0289, 51.5902] },
          properties: { name: "Civic Centre", address: "Forest Rd, E17" },
        },
      ],
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

// Suggest place button
document
  .getElementById("fab-suggest")
  .addEventListener("click", () => window.open(FORM_URL, "_blank"));

// Load data + layers
map.on("load", async () => {
  const data = await fetchGeoJSON();

  map.addSource("places", {
    type: "geojson",
    data,
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 14,
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
      "circle-stroke-width": 2,
    },
  });

  // Cluster counts
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "places",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12,
    },
    paint: { "text-color": "#fff" },
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
      "circle-blur": 0.6,
    },
  });

  // ✅ Load custom marker
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
          "icon-allow-overlap": true,
        },
      });
    } else {
      console.warn("Custom pin not found, falling back to circle markers.");
      map.addLayer({
        id: "unclustered",
        type: "circle",
        source: "places",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#ffd300",
          "circle-radius": 8,
          "circle-stroke-color": "#111",
          "circle-stroke-width": 2,
        },
      });
    }
  });

  // ✅ Popups on pin click
  map.on("click", "unclustered", (e) => {
    const coords = e.features[0].geometry.coordinates.slice();
    const { name, address, category } = e.features[0].properties;

    new maplibregl.Popup()
      .setLngLat(coords)
      .setHTML(
        `<strong>${name}</strong><br>${address || ""}<br><em>${category ||
          ""}</em>`
      )
      .addTo(map);
  });

  // ✅ Cursor pointer on hover
  map.on("mouseenter", "unclustered", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "unclustered", () => {
    map.getCanvas().style.cursor = "";
  });
});

// ✅ Haversine distance helper
function getDistance(coord1, coord2) {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ✅ Search box with results list
const searchInput = document.getElementById("search");
const resultsDiv = document.getElementById("results");

if (searchInput) {
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) return;

      fetch(GEOJSON_URL)
        .then((res) => res.json())
        .then((data) => {
          const matches = data.features.filter((f) => {
            const { name, address, category } = f.properties;
            return (
              (name && name.toLowerCase().includes(query)) ||
              (address && address.toLowerCase().includes(query)) ||
              (category && category.toLowerCase().includes(query))
            );
          });

          if (matches.length) {
            const mapCenter = map.getCenter().toArray();
            matches.sort(
              (a, b) =>
                getDistance(mapCenter, a.geometry.coordinates) -
                getDistance(mapCenter, b.geometry.coordinates)
            );

            const top5 = matches.slice(0, 5);

            // Clear old results
            resultsDiv.innerHTML = "";

            top5.forEach((match) => {
              const { name, address, category } = match.properties;
              const coords = match.geometry.coordinates;

              const card = document.createElement("div");
              card.className = "result-card";
              card.innerHTML = `
                <strong>${name}</strong>
                ${address || ""}<br>
                <em>${category || ""}</em>
              `;
              card.addEventListener("click", () => {
                map.flyTo({ center: coords, zoom: 16 });
                new maplibregl.Popup()
                  .setLngLat(coords)
                  .setHTML(
                    `<strong>${name}</strong><br>${address || ""}<br><em>${category || ""}</em>`
                  )
                  .addTo(map);
              });

              resultsDiv.appendChild(card);
            });
          } else {
            resultsDiv.innerHTML = "<p>No results found.</p>";
          }
        });
    }
  });
}

// Catch missing icons
map.on("styleimagemissing", (e) => {
  console.warn("Missing image:", e.id);
});

