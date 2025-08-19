/* MappyChange – main script */
const MAPTILER_KEY = "zouFxW02vyhPO2yBO8SN";
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
const GEOJSON_URL = "/data/mappychange_walthamstow.geojson";
const FORM_URL = "https://forms.gle/VUFTbD6G8dLh2DrD7";
const DEFAULT_BOUNDS = [[-0.064, 51.556],[0.028, 51.615]];
const MARKER_ICON = "assets/pin.png";

let PLACES = []; // all features loaded

/* Map init */
const map = new maplibregl.Map({
  container: "map",
  style: STYLE_URL,
  bounds: DEFAULT_BOUNDS
});
map.addControl(new maplibregl.NavigationControl());

/* Fetch GeoJSON */
async function loadData(){
  try {
    const res = await fetch(GEOJSON_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    PLACES = data.features;
    map.getSource("places").setData(data);
  } catch(err){
    console.error("GeoJSON load failed", err);
  }
}

/* Distance util (Haversine) */
function distanceKm(coord1, coord2){
  const toRad = d => d*Math.PI/180;
  const [lon1, lat1] = coord1, [lon2, lat2] = coord2;
  const R = 6371;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* Escape HTML */
function escapeHtml(s){
  return s ? s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) : "";
}

/* Render results list */
function renderResults(matches){
  const container = document.getElementById("results");
  container.innerHTML = "";
  if (!matches.length){
    container.innerHTML = "<p>No results found.</p>";
    return;
  }

  matches.forEach(({ f, d }) => {
    const p = f.properties || {};
    const coords = f.geometry.coordinates;
    const name  = escapeHtml(p.name || "Location");
    const addr  = escapeHtml(p.address || "");
    const pc    = escapeHtml(p.postcode || "");
    const cat   = escapeHtml(p.category || "");
    const bc    = (p.baby_change || "").toString().toLowerCase();
    const bcText = bc === "yes" ? "Baby change" : bc === "no" ? "No baby change" : String(p.baby_change || "").trim();
    const locText = escapeHtml(p.changing_location || "");

    const card = document.createElement("button");
    card.type = "button";
    card.className = "result-card";
    card.setAttribute("aria-label", `View ${name} on map`);

    card.innerHTML = `
      <span class="card-icon"><img src="${MARKER_ICON}" alt=""></span>
      <div class="card-main">
        <p class="card-title">${name}</p>
        <p class="card-sub">${addr}${pc ? " " + pc : ""}</p>
        <div class="card-tags">
          ${cat ? `<span class="tag">${cat}</span>` : ""}
          ${bcText ? `<span class="tag ${bc === "yes" ? "accent" : ""}">${escapeHtml(bcText)}</span>` : ""}
          ${locText ? `<span class="tag">${locText}</span>` : ""}
        </div>
      </div>
      <div class="card-dist">${Number.isFinite(d) ? `${d.toFixed(1)} km` : ""}</div>
    `;

    card.addEventListener("click", () => {
      map.flyTo({ center: coords, zoom: 16 });
      new maplibregl.Popup()
        .setLngLat(coords)
        .setHTML(`
          <strong>${name}</strong><br>
          ${addr} ${pc}<br>
          <em>${cat}</em><br>
          ${bcText ? `${escapeHtml(bcText)}<br>` : ""}
          ${locText}
        `)
        .addTo(map);
    });

    container.appendChild(card);
  });
}

/* Search */
async function runSearch(){
  const q = document.getElementById("search").value.trim().toLowerCase();
  if (!q){ document.getElementById("results").innerHTML=""; return; }

  // crude postcode detection: if query matches letters+digits pattern
  const postcodeMatch = PLACES.filter(f=>{
    const pc = (f.properties.postcode||"").toLowerCase();
    return pc.includes(q);
  });

  let matches = postcodeMatch.length ? postcodeMatch : PLACES.filter(f=>{
    const p = f.properties||{};
    return (p.name||"").toLowerCase().includes(q) ||
           (p.address||"").toLowerCase().includes(q) ||
           (p.postcode||"").toLowerCase().includes(q);
  });

  const centre = map.getCenter().toArray();
  matches = matches.map(f=>({ f, d: distanceKm(centre,f.geometry.coordinates) }))
                   .sort((a,b)=>a.d-b.d)
                   .slice(0,5);

  renderResults(matches);
}

/* Controls */
document.getElementById("search-btn").addEventListener("click", runSearch);
document.getElementById("search").addEventListener("keyup", (e)=>{
  if (e.key==="Enter") runSearch();
});

document.getElementById("locate").addEventListener("click", ()=>{
  if (navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      const {latitude, longitude} = pos.coords;
      map.flyTo({ center:[longitude, latitude], zoom:14 });
      const matches = PLACES.map(f=>({ f, d: distanceKm([longitude,latitude],f.geometry.coordinates) }))
                            .sort((a,b)=>a.d-b.d)
                            .slice(0,5);
      renderResults(matches);
    });
  }
});

document.getElementById("fab-suggest").addEventListener("click", ()=> window.open(FORM_URL, "_blank"));

/* Map layers */
map.on("load", async () => {
  map.addSource("places", { type:"geojson", data:{ type:"FeatureCollection", features:[] }, cluster:true, clusterRadius:50, clusterMaxZoom:14 });

  map.addLayer({ id:"clusters", type:"circle", source:"places", filter:["has","point_count"],
    paint:{ "circle-color":"#111","circle-radius":["step",["get","point_count"],16,10,22,25,28],
            "circle-stroke-color":"#ffd300","circle-stroke-width":2 } });
  map.addLayer({ id:"cluster-count", type:"symbol", source:"places", filter:["has","point_count"],
    layout:{ "text-field":["get","point_count_abbreviated"],"text-size":12 }, paint:{ "text-color":"#fff" } });
  map.addLayer({ id:"unclustered", type:"circle", source:"places", filter:["!",["has","point_count"]],
    paint:{ "circle-color":"#ffd300","circle-radius":8,"circle-stroke-color":"#111","circle-stroke-width":2 } });

  map.on("click","unclustered",e=>{
    const f = e.features[0];
    const coords = f.geometry.coordinates.slice();
    const p = f.properties;
    new maplibregl.Popup()
      .setLngLat(coords)
      .setHTML(`<strong>${escapeHtml(p.name||"")}</strong><br>${escapeHtml(p.address||"")} ${escapeHtml(p.postcode||"")}`)
      .addTo(map);
  });

  loadData();
});



