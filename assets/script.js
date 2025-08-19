// assets/script.js

// Config
const MAPTILER_KEY = "zouFxW02vyhPO2yBO8SN";
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
const GEOJSON_URL = "data/mappychange_walthamstow.geojson";   // relative path
const FORM_URL = "https://forms.gle/VUFTbD6G8dLh2DrD7";
const DEFAULT_BOUNDS = [[-0.064, 51.556],[0.028, 51.615]];
const MARKER_ICON = "assets/pin.png";                         // relative path

// Elements
const searchInput = document.getElementById("search");
const searchBtn   = document.getElementById("searchBtn");
const resultsDiv  = document.getElementById("results");

// Map
const map = new maplibregl.Map({
  container: "map",
  style: STYLE_URL,
  bounds: DEFAULT_BOUNDS
});
map.addControl(new maplibregl.NavigationControl());

// Data cache
let GEOJSON = null;

// Utilities
function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  }[m]));
}
function norm(s)   { return String(s || "").toLowerCase(); }
function normPC(s) { return String(s || "").replace(/\s+/g, "").toLowerCase(); }
// Haversine distance (km)
function distanceKm([lon1,lat1],[lon2,lat2]){
  const R=6371, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Load GeoJSON once
async function loadData(){
  const res = await fetch(GEOJSON_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("GeoJSON HTTP " + res.status);
  GEOJSON = await res.json();
  map.getSource("places").setData(GEOJSON);
}

// Render up to 5 nearest result cards
function renderResults(rows){
  resultsDiv.innerHTML = "";
  if (!rows.length){
    resultsDiv.innerHTML = "<p>No results found.</p>";
    return;
  }
  rows.forEach(({ f, d }) => {
    const p = f.properties || {};
    const coords = f.geometry.coordinates;
    const name  = escapeHtml(p.name || "Location");
    const addr  = escapeHtml(p.address || "");
    const pc    = escapeHtml(p.postcode || "");
    const cat   = escapeHtml(p.category || "");
    const bcVal = (p.baby_change || "").toString().toLowerCase();
    const bcTxt = bcVal === "yes" ? "Baby change" : bcVal === "no" ? "No baby change" : escapeHtml(String(p.baby_change || ""));
    const locTxt = escapeHtml(p.changing_location || "");

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
          ${bcTxt ? `<span class="tag ${bcVal === "yes" ? "accent" : ""}">${bcTxt}</span>` : ""}
          ${locTxt ? `<span class="tag">${locTxt}</span>` : ""}
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
          ${bcTxt ? `${bcTxt}<br>` : ""}
          ${locTxt}
        `)
        .addTo(map);
    });
    resultsDiv.appendChild(card);
  });
}

// Build nearest list from a reference point
function listNearestFrom(refCoords){
  if (!GEOJSON) return;
  const rows = GEOJSON.features
    .map(f => ({ f, d: distanceKm(refCoords, f.geometry.coordinates) }))
    .sort((a,b) => a.d - b.d)
    .slice(0, 5);
  renderResults(rows);
}

// UK postcode geocode via postcodes.io
async function geocodePostcode(pc){
  try{
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.result) return [data.result.longitude, data.result.latitude];
  }catch(e){ /* ignore */ }
  return null;
}

// Search handler
async function runSearch(){
  if (!GEOJSON) return;

  const qRaw = (searchInput?.value || "").trim();
  if (!qRaw){
    resultsDiv.innerHTML = "";
    return;
  }

  let ref = map.getCenter().toArray();
  const qNorm = norm(qRaw);
  const qPC   = normPC(qRaw);

  // If looks like a UK postcode, geocode and recenter
  if (/^[A-Za-z0-9 ]{3,8}$/.test(qRaw)) {
    const pcLoc = await geocodePostcode(qRaw);
    if (pcLoc){
      ref = pcLoc;
      map.flyTo({ center: ref, zoom: 14 });
    }
  }

  // Text and postcode matching against properties
  const matches = GEOJSON.features.filter(f=>{
    const p = f.properties || {};
    const name = norm(p.name);
    const addr = norm(p.address);
    const cat  = norm(p.category);
    const propPC = normPC(p.postcode);
    const addrPC = normPC(p.address);
    const textHit = name.includes(qNorm) || addr.includes(qNorm) || cat.includes(qNorm);
    const pcHit   = (propPC && propPC.includes(qPC)) || (addrPC && addrPC.includes(qPC));
    return textHit || pcHit;
  }).map(f => ({ f, d: distanceKm(ref, f.geometry.coordinates) }))
    .sort((a,b)=>a.d-b.d)
    .slice(0,5);

  renderResults(matches);
}

// Wire up controls
searchBtn?.addEventListener("click", runSearch);
searchInput?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); runSearch(); }});
document.getElementById("locate")?.addEventListener("click", ()=>{
  if (navigator.geolocation){
    navigator.geolocation.getCurrentPosition(({coords})=>{
      const me = [coords.longitude, coords.latitude];
      map.flyTo({ center: me, zoom: 14 });
      listNearestFrom(me);
    });
  }
});
document.getElementById("fab-suggest")?.addEventListener("click", ()=> window.open(FORM_URL, "_blank"));

// Map layers
map.on("load", async () => {
  // Add empty source first, then load data into it
  map.addSource("places", { type:"geojson", data:{ type:"FeatureCollection", features:[] }, cluster:true, clusterRadius:50, clusterMaxZoom:14 });

  // Clusters
  map.addLayer({
    id:"clusters",
    type:"circle",
    source:"places",
    filter:["has","point_count"],
    paint:{
      "circle-color":"#111",
      "circle-radius":["step",["get","point_count"],16,10,22,25,28],
      "circle-stroke-color":"#ffd300",
      "circle-stroke-width":2
    }
  });
  map.addLayer({
    id:"cluster-count",
    type:"symbol",
    source:"places",
    filter:["has","point_count"],
    layout:{ "text-field":["get","point_count_abbreviated"], "text-size":12 },
    paint:{ "text-color":"#fff" }
  });

  // Soft shadow under single pins
  map.addLayer({
    id:"unclustered-shadow",
    type:"circle",
    source:"places",
    filter:["!",["has","point_count"]],
    paint:{ "circle-color":"rgba(0,0,0,0.18)", "circle-radius":10, "circle-blur":0.6 }
  });

  // Try to load custom pin; if it fails, fall back to circle markers
  map.loadImage(MARKER_ICON, (error, image) => {
    if (!error && image) {
      if (!map.hasImage("custom-pin")) map.addImage("custom-pin", image);
      map.addLayer({
        id:"unclustered",
        type:"symbol",
        source:"places",
        filter:["!",["has","point_count"]],
        layout:{ "icon-image":"custom-pin", "icon-size":0.06, "icon-allow-overlap":true }
      });
    } else {
      console.warn("Custom pin not found, using circle markers.");
      map.addLayer({
        id:"unclustered",
        type:"circle",
        source:"places",
        filter:["!",["has","point_count"]],
        paint:{ "circle-color":"#ffd300","circle-radius":8,"circle-stroke-color":"#111","circle-stroke-width":2 }
      });
    }
  });

  // Cluster click → zoom in
  map.on("click","clusters",(e)=>{
    const f = map.queryRenderedFeatures(e.point,{layers:["clusters"]})[0];
    const id = f.properties.cluster_id;
    map.getSource("places").getClusterExpansionZoom(id,(err,zoom)=>{
      if (err) return;
      map.easeTo({ center: f.geometry.coordinates, zoom });
    });
  });
  map.on("mouseenter","clusters",()=>map.getCanvas().style.cursor="pointer");
  map.on("mouseleave","clusters",()=>map.getCanvas().style.cursor="");

  // Single pin click → popup and refresh nearest list
  map.on("click","unclustered",(e)=>{
    const f = e.features[0];
    const coords = f.geometry.coordinates.slice();
    const p = f.properties || {};
    map.flyTo({ center: coords, zoom: 16 });
    new maplibregl.Popup()
      .setLngLat(coords)
      .setHTML(`
        <strong>${escapeHtml(p.name||"Location")}</strong><br>
        ${escapeHtml(p.address||"")} ${escapeHtml(p.postcode||"")}<br>
        <em>${escapeHtml(p.category||"")}</em><br>
        ${p.baby_change ? escapeHtml(String(p.baby_change)) + "<br>" : ""}
        ${p.changing_location ? escapeHtml(String(p.changing_location)) : ""}
      `)
      .addTo(map);
    listNearestFrom(coords);
  });
  map.on("mouseenter","unclustered",()=>map.getCanvas().style.cursor="pointer");
  map.on("mouseleave","unclustered",()=>map.getCanvas().style.cursor="");

  // Load data and show initial nearest 5 from map centre
  await loadData();
  listNearestFrom(map.getCenter().toArray());
});

// Helpful for debugging missing images
map.on("styleimagemissing", e => console.warn("Missing image:", e.id));
