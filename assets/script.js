// Config
const MAPTILER_KEY = "zouFxW02vyhPO2yBO8SN"; // your key
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
const GEOJSON_URL = "data/mappychange_walthamstow.geojson";        // relative for GitHub Pages
const FORM_URL = "https://forms.gle/VUFTbD6G8dLh2DrD7";
const MARKER_ICON = "assets/pin.png";                               // relative for GitHub Pages
const DEFAULT_BOUNDS = [[-0.064, 51.556],[0.028, 51.615]];          // Walthamstow

// Elements
const searchInput = document.getElementById("search");
const searchBtn   = document.getElementById("searchBtn");
const resultsDiv  = document.getElementById("results");

// Map
const map = new maplibregl.Map({ container: "map", style: STYLE_URL, bounds: DEFAULT_BOUNDS });
map.addControl(new maplibregl.NavigationControl());

// Data cache
let PLACES = [];

// Helpers
function norm(s){ return String(s||"").toLowerCase(); }
function normPC(s){ return String(s||"").replace(/\s+/g,"").toLowerCase(); }
function distanceKm([lon1,lat1],[lon2,lat2]){
  const R=6371, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function escapeHtml(str){return String(str).replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[s]));}

// Load GeoJSON once
async function loadData(){
  const res = await fetch(GEOJSON_URL, { cache: "no-store" });
  if(!res.ok) throw new Error("GeoJSON HTTP " + res.status);
  const data = await res.json();
  PLACES = data.features || [];

  map.addSource("places", { type:"geojson", data });

  // shadow first
  map.addLayer({
    id:"unclustered-shadow", type:"circle", source:"places",
    paint:{ "circle-color":"rgba(0,0,0,0.18)", "circle-radius":10, "circle-blur":0.6 }
  });

  // custom icon, with fallback to circles
  map.loadImage(MARKER_ICON, (error, image) => {
    if (!error && image) {
      if (!map.hasImage("custom-pin")) map.addImage("custom-pin", image);
      map.addLayer({
        id:"unclustered", type:"symbol", source:"places",
        layout:{ "icon-image":"custom-pin", "icon-size":0.06, "icon-allow-overlap":true }
      });
    } else {
      console.warn("Custom pin missing, using circle markers.");
      map.addLayer({
        id:"unclustered", type:"circle", source:"places",
        paint:{ "circle-color":"#ffd300","circle-radius":8,"circle-stroke-color":"#111","circle-stroke-width":2 }
      });
    }
  });

  // popups
  map.on("click","unclustered",(e)=>{
    const f = e.features[0];
    const p = f.properties || {};
    new maplibregl.Popup()
      .setLngLat(f.geometry.coordinates)
      .setHTML(`
        <strong>${escapeHtml(p.name||"Location")}</strong><br>
        ${escapeHtml(p.address||"")} ${escapeHtml(p.postcode||"")}<br>
        <em>${escapeHtml(p.category||"")}</em>
      `)
      .addTo(map);
  });
  map.on("mouseenter","unclustered",()=>map.getCanvas().style.cursor="pointer");
  map.on("mouseleave","unclustered",()=>map.getCanvas().style.cursor="");
}
map.on("styleimagemissing",(e)=>console.warn("Missing image:", e.id));
map.on("load", loadData);

// Geocode UK postcodes with postcodes.io
async function geocodePostcode(pc){
  try{
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
    if(!res.ok) return null;
    const data = await res.json();
    if(data && data.result) return [data.result.longitude, data.result.latitude];
  }catch(err){ console.warn("Geocode failed:", err); }
  return null;
}

// Search logic
async function runSearch(){
  const qRaw = (searchInput?.value || "").trim();
  if(!qRaw) return;
  const qNorm = norm(qRaw);
  const qPC   = normPC(qRaw);

  // reference point: postcode if possible, else map centre
  let ref = map.getCenter().toArray();
  if (/^[A-Za-z0-9 ]{3,8}$/.test(qRaw)) {
    const geo = await geocodePostcode(qRaw);
    if (geo) { ref = geo; map.flyTo({ center: ref, zoom: 14 }); }
  }

  const matches = PLACES.filter(f=>{
    const p=f.properties||{};
    const name=norm(p.name), addr=norm(p.address), cat=norm(p.category);
    const propPC=normPC(p.postcode), addrPC=normPC(p.address);
    const textHit = name.includes(qNorm) || addr.includes(qNorm) || cat.includes(qNorm);
    const pcHit   = (propPC && propPC.includes(qPC)) || (addrPC && addrPC.includes(qPC));
    return textHit || pcHit;
  }).map(f=>({ f, d: distanceKm(ref, f.geometry.coordinates) }))
    .sort((a,b)=>a.d-b.d)
    .slice(0,5);

  // render cards
  resultsDiv.innerHTML = matches.length ? "" : "<p>No results found.</p>";
  matches.forEach(({f,d})=>{
    const p=f.properties||{};
    const el=document.createElement("div");
    el.className="result-card";
    el.innerHTML = `
      <strong>${escapeHtml(p.name||"Location")}</strong>
      ${escapeHtml(p.address||"")} ${p.postcode?escapeHtml(" "+p.postcode):""}<br>
      <em>${escapeHtml(p.category||"")}</em><br>
      <small>${d.toFixed(1)} km away</small>
    `;
    el.addEventListener("click", ()=>{
      const coords=f.geometry.coordinates;
      map.flyTo({ center: coords, zoom: 16 });
      new maplibregl.Popup()
        .setLngLat(coords)
        .setHTML(`
          <strong>${escapeHtml(p.name||"Location")}</strong><br>
          ${escapeHtml(p.address||"")} ${escapeHtml(p.postcode||"")}<br>
          <em>${escapeHtml(p.category||"")}</em>
        `)
        .addTo(map);
    });
    resultsDiv.appendChild(el);
  });
}

// Wire controls
searchBtn?.addEventListener("click", runSearch);
searchInput?.addEventListener("keydown", e => { if(e.key==="Enter"){ e.preventDefault(); runSearch(); }});
document.getElementById("locate")?.addEventListener("click", ()=>{
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(({coords})=>{
      map.flyTo({ center:[coords.longitude, coords.latitude], zoom:14 });
      new maplibregl.Marker().setLngLat([coords.longitude, coords.latitude]).addTo(map);
    });
  }
});
document.getElementById("fab-suggest")?.addEventListener("click", ()=> window.open(FORM_URL, "_blank"));


