// === CONFIG ===
const MAPTILER_KEY = "zouFxW02vyhPO2yBO8SN";
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
const GEOJSON_URL = "assets/mappychange_walthamstow.geojson";
const FORM_URL = "https://forms.gle/VUFTbD6G8dLh2DrD7";

// === INIT MAP ===
const map = L.map('map').setView([51.5856, -0.0197], 14);

L.tileLayer(
  `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`, 
  {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    tileSize: 512,
    zoomOffset: -1
  }
).addTo(map);

// === ICON ===
const pinIcon = L.icon({
  iconUrl: 'assets/pin.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
});

let geojsonData;

// === LOAD GEOJSON ===
fetch(GEOJSON_URL)
  .then(res => res.json())
  .then(data => {
    geojsonData = data;
    L.geoJSON(data, {
      pointToLayer: (feature, latlng) => L.marker(latlng, { icon: pinIcon }),
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        layer.bindPopup(`
          <strong>${props.name}</strong><br>
          ${props.address || ''} ${props.postcode || ''}<br>
          <em>${props.category || ''}</em><br>
          ${props.baby_change ? '✅ Baby change' : '❌ No baby change'}
        `);
      }
    }).addTo(map);
  });

// === SEARCH ===
function searchPlaces(query) {
  if (!geojsonData) return [];
  return geojsonData.features.filter(f =>
    f.properties.name.toLowerCase().includes(query.toLowerCase()) ||
    (f.properties.address && f.properties.address.toLowerCase().includes(query.toLowerCase())) ||
    (f.properties.postcode && f.properties.postcode.toLowerCase().includes(query.toLowerCase()))
  );
}

document.getElementById('search').addEventListener('input', e => {
  const query = e.target.value.trim();
  if (!query) return;

  const results = searchPlaces(query);
  if (results.length > 0) {
    const coords = results[0].geometry.coordinates;
    map.setView([coords[1], coords[0]], 17);
  }
});

// === USE MY LOCATION ===
document.getElementById('locate').addEventListener('click', () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 16);
      L.marker([latitude, longitude]).addTo(map)
        .bindPopup("You are here").openPopup();
    });
  }
});

// === FAB (suggest a place) ===
document.getElementById('fab-suggest').addEventListener('click', () => {
  window.open(FORM_URL, '_blank');
});
