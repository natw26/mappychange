// assets/script.js

const MAPTILER_KEY = "zouFxW02vyhPO2yBO8SN";
const GEOJSON_URL = "data/mappychange_walthamstow.geojson";
const FORM_URL = "https://forms.gle/VUFTbD6G8dLh2DrD7";
const DEFAULT_BOUNDS = [[-0.064, 51.556],[0.028, 51.615]];
const MARKER_ICON = "assets/pin.png";

// Haversine distance in km
function distanceKm([lon1,lat1],[lon2,lat2]){
  const R=6371, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Escape helper for HTML
function escapeHtml(str=""){
  return String(str).replace(/[&<>"']/g,m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

// Map init
const map = new maplibregl.Map({
  container:"map",
  style:`https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
  bounds:DEFAULT_BOUNDS
});
map.addControl(new maplibregl.NavigationControl());

let geojsonData;

// Fetch data
async function fetchGeoJSON(){
  const res = await fetch(GEOJSON_URL, {cache:"no-store"});
  if(!res.ok) throw new Error("GeoJSON missing");
  return await res.json();
}

// Build cards
function updateCards(centerCoords){
  if(!geojsonData) return;
  const sorted = geojsonData.features.map(f=>({
    ...f,
    dist: distanceKm(centerCoords, f.geometry.coordinates)
  })).sort((a,b)=>a.dist-b.dist).slice(0,5);

  const cardsDiv=document.getElementById("cards");
  cardsDiv.innerHTML="";
  sorted.forEach(f=>{
    const p=f.properties||{};
    const c=f.geometry.coordinates;
    const card=document.createElement("div");
    card.className="card";
    card.innerHTML=`
      <div class="card-header">
        <img src="${MARKER_ICON}" alt="pin" class="card-icon">
        <h3>${escapeHtml(p.name||"Location")}</h3>
      </div>
      <p>${escapeHtml(p.address||"")}${p.postcode? ", "+escapeHtml(p.postcode):""}</p>
      <p><em>${escapeHtml(p.category||"")}</em></p>
      ${p.changing_location? `<p>Baby change: ${escapeHtml(p.changing_location)}</p>`:""}
      <p class="distance">${f.dist.toFixed(2)} km away</p>
    `;
    card.onclick=()=>map.flyTo({center:c,zoom:16});
    cardsDiv.appendChild(card);
  });
}

map.on("load", async()=>{
  geojsonData=await fetchGeoJSON();

  map.addSource("places", {
    type:"geojson",
    data:geojsonData,
    cluster:true,
    clusterRadius:50,
    clusterMaxZoom:14
  });

  // cluster circles
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
    layout:{ "text-field":["get","point_count_abbreviated"],"text-size":12 },
    paint:{ "text-color":"#fff" }
  });

  // unclustered shadow + marker
  map.addLayer({
    id:"unclustered-shadow",
    type:"circle",
    source:"places",
    filter:["!",["has","point_count"]],
    paint:{ "circle-color":"rgba(0,0,0,0.18)","circle-radius":10,"circle-blur":0.6 }
  });

  map.loadImage(MARKER_ICON,(error,image)=>{
    if(!error&&image){
      if(!map.hasImage("custom-pin")) map.addImage("custom-pin",image);
      map.addLayer({
        id:"unclustered",
        type:"symbol",
        source:"places",
        filter:["!",["has","point_count"]],
        layout:{ "icon-image":"custom-pin","icon-size":0.06,"icon-allow-overlap":true }
      });
    }
  });

  // cluster click → zoom
  map.on("click","clusters",e=>{
    const f=map.queryRenderedFeatures(e.point,{layers:["clusters"]})[0];
    const id=f.properties.cluster_id;
    map.getSource("places").getClusterExpansionZoom(id,(err,zoom)=>{
      if(err)return;
      map.easeTo({center:f.geometry.coordinates,zoom});
    });
  });

  // unclustered pin click → popup + recenter + cards
  map.on("click","unclustered",e=>{
    const f=e.features[0], coords=f.geometry.coordinates.slice(), p=f.properties||{};
    map.flyTo({center:coords,zoom:16});
    new maplibregl.Popup()
      .setLngLat(coords)
      .setHTML(`
        <strong>${escapeHtml(p.name||"Location")}</strong><br>
        ${escapeHtml(p.address||"")} ${escapeHtml(p.postcode||"")}<br>
        <em>${escapeHtml(p.category||"")}</em><br>
        ${p.changing_location? escapeHtml(p.changing_location):""}
      `).addTo(map);
    updateCards(coords);
  });

  map.on("mouseenter","unclustered",()=>map.getCanvas().style.cursor="pointer");
  map.on("mouseleave","unclustered",()=>map.getCanvas().style.cursor="");

  // initial cards
  updateCards([ -0.0197,51.5856 ]);
});

// locate button
document.getElementById("locate").addEventListener("click",()=>{
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      const coords=[pos.coords.longitude,pos.coords.latitude];
      map.flyTo({center:coords,zoom:14});
      updateCards(coords);
    });
  }
});

// suggest button
document.getElementById("fab-suggest").addEventListener("click",()=>window.open(FORM_URL,"_blank"));

// search handlers
function runSearch(){
  const q=document.getElementById("search").value.trim();
  if(!q) return;
  // First try geocoding postcode / place
  fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${MAPTILER_KEY}&language=en&region=gb`)
    .then(r=>r.json()).then(json=>{
      if(json.features && json.features.length>0){
        const loc=json.features[0].geometry.coordinates;
        map.flyTo({center:loc,zoom:15});
        updateCards(loc);
      } else {
        // fallback: search properties by name
        if(geojsonData){
          const found=geojsonData.features.find(f=>(f.properties.name||"").toLowerCase().includes(q.toLowerCase()));
          if(found){
            const coords=found.geometry.coordinates;
            map.flyTo({center:coords,zoom:16});
            updateCards(coords);
          }
        }
      }
    }).catch(()=>{});
}

document.getElementById("searchBtn").addEventListener("click",runSearch);
document.getElementById("search").addEventListener("keypress",e=>{
  if(e.key==="Enter"){ e.preventDefault(); runSearch(); }
});

