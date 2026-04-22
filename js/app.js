/* ============================================================
   WebGIS Pendidikan Baolan - Vanilla JS + Leaflet
   ============================================================ */

const STATE = {
  schools: [],
  kecamatan: null,
  visibleJenjang: { SD: true, SMP: true, SMA: true },
  status: "all",
  basemap: "osm",
  markers: {},      // id -> L.marker
  layerGroup: null,
  boundaryLayer: null,
  baseLayer: null,
  userMarker: null,
};

const BAOLAN_CENTER = [1.04, 120.81];

/* ---------- Helpers ---------- */
const classify = (name) =>
  /negeri|pembina|percontohan|madrasah\s+aliyah\s+negeri|slb\s+negeri/i.test(name) ? "Negeri" : "Swasta";

const toSchools = (fc, jenjang) =>
  fc.features.map((f, i) => ({
    id: `${jenjang}-${i}`,
    name: f.properties.NAMOBJ,
    jenjang,
    status: classify(f.properties.NAMOBJ),
    remark: f.properties.REMARK || "-",
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));

/* ---------- Data Loader ---------- */
async function loadData() {
  const [sd, smp, sma, kec] = await Promise.all([
    fetch("data/SD_4.json").then(r => r.json()),
    fetch("data/SMP_3.json").then(r => r.json()),
    fetch("data/SMA_2.json").then(r => r.json()),
    fetch("data/KECAMATANBAOLAN_1.json").then(r => r.json()),
  ]);
  STATE.schools = [
    ...toSchools(sd, "SD"),
    ...toSchools(smp, "SMP"),
    ...toSchools(sma, "SMA"),
  ];
  STATE.kecamatan = kec;
}

/* ---------- Map ---------- */
let map;
function initMap() {
  map = L.map("map", { zoomControl: true, attributionControl: true })
    .setView(BAOLAN_CENTER, 13);
  setBasemap("osm");

  // boundary
  STATE.boundaryLayer = L.geoJSON(STATE.kecamatan, {
    style: { color: "#60a5fa", weight: 2, dashArray: "6,6", fillColor: "#3b82f6", fillOpacity: 0.05 }
  }).addTo(map);
  map.fitBounds(STATE.boundaryLayer.getBounds(), { padding: [40, 40] });

  STATE.layerGroup = L.layerGroup().addTo(map);
  renderMarkers();
}

function setBasemap(type) {
  if (STATE.baseLayer) map.removeLayer(STATE.baseLayer);
  if (type === "sat") {
    STATE.baseLayer = L.tileLayer(
      "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
      { subdomains: ["mt0","mt1","mt2","mt3"], maxZoom: 20, attribution: "© Google" }
    );
  } else {
    STATE.baseLayer = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19, attribution: "© OpenStreetMap" }
    );
  }
  STATE.baseLayer.addTo(map);
}

function makeIcon(jenjang) {
  return L.divIcon({
    className: "",
    html: `<div class="school-marker ${jenjang.toLowerCase()}">${jenjang}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function popupHTML(s) {
  return `
    <h4>${s.name}</h4>
    <div>${s.remark}</div>
    <div class="meta"><i class="fa-solid fa-location-dot"></i> ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</div>
    <div><span class="pill">${s.jenjang}</span><span class="pill">${s.status}</span></div>
  `;
}

function renderMarkers() {
  STATE.layerGroup.clearLayers();
  STATE.markers = {};
  const filtered = STATE.schools.filter(s =>
    STATE.visibleJenjang[s.jenjang] && (STATE.status === "all" || s.status === STATE.status)
  );
  filtered.forEach(s => {
    const m = L.marker([s.lat, s.lng], { icon: makeIcon(s.jenjang) })
      .bindPopup(popupHTML(s));
    STATE.markers[s.id] = m;
    STATE.layerGroup.addLayer(m);
  });
  updateStats(filtered);
}

/* ---------- Stats ---------- */
function updateStats(list) {
  const all = STATE.schools;
  const counts = { SD: 0, SMP: 0, SMA: 0 };
  list.forEach(s => counts[s.jenjang]++);
  document.getElementById("stat-total").textContent = list.length;
  document.getElementById("stat-sd").textContent = counts.SD;
  document.getElementById("stat-smp").textContent = counts.SMP;
  document.getElementById("stat-sma").textContent = counts.SMA;
  const max = Math.max(counts.SD, counts.SMP, counts.SMA, 1);
  document.getElementById("bar-sd").style.width = (counts.SD / max * 100) + "%";
  document.getElementById("bar-smp").style.width = (counts.SMP / max * 100) + "%";
  document.getElementById("bar-sma").style.width = (counts.SMA / max * 100) + "%";
}

/* ---------- Search ---------- */
function setupSearch() {
  const input = document.getElementById("search");
  const list = document.getElementById("search-results");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { list.classList.add("hidden"); return; }
    const matches = STATE.schools
      .filter(s => s.name.toLowerCase().includes(q))
      .slice(0, 8);
    list.innerHTML = matches.map(s =>
      `<li data-id="${s.id}"><strong>${s.name}</strong><br><small style="color:var(--muted)">${s.jenjang} • ${s.status}</small></li>`
    ).join("") || `<li style="color:var(--muted)">Tidak ditemukan</li>`;
    list.classList.remove("hidden");
  });

  list.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-id]");
    if (!li) return;
    const s = STATE.schools.find(x => x.id === li.dataset.id);
    focusSchool(s);
    list.classList.add("hidden");
    input.value = s.name;
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) list.classList.add("hidden");
  });
}

function focusSchool(s) {
  if (!s) return;
  // ensure jenjang visible
  if (!STATE.visibleJenjang[s.jenjang]) {
    STATE.visibleJenjang[s.jenjang] = true;
    document.querySelector(`input[data-jenjang="${s.jenjang}"]`).checked = true;
    renderMarkers();
  }
  map.flyTo([s.lat, s.lng], 17, { duration: 1.2 });
  setTimeout(() => STATE.markers[s.id]?.openPopup(), 1200);
}

/* ---------- UI Controls ---------- */
function setupControls() {
  // Jenjang toggles
  document.querySelectorAll('input[data-jenjang]').forEach(cb => {
    cb.addEventListener("change", () => {
      STATE.visibleJenjang[cb.dataset.jenjang] = cb.checked;
      renderMarkers();
    });
  });

  // Status chips
  document.querySelectorAll('.chip[data-status]').forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll('.chip[data-status]').forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      STATE.status = btn.dataset.status;
      renderMarkers();
    });
  });

  // Basemap chips
  document.querySelectorAll('.chip[data-basemap]').forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll('.chip[data-basemap]').forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      setBasemap(btn.dataset.basemap);
    });
  });

  // Sidebar collapse
  const sidebar = document.getElementById("sidebar");
  const btnCollapse = document.getElementById("btn-collapse");
  const btnExpand = document.getElementById("btn-expand");
  btnCollapse.addEventListener("click", () => {
    sidebar.classList.add("collapsed");
    btnExpand.classList.remove("hidden");
    setTimeout(() => map.invalidateSize(), 320);
  });
  btnExpand.addEventListener("click", () => {
    sidebar.classList.remove("collapsed");
    btnExpand.classList.add("hidden");
    setTimeout(() => map.invalidateSize(), 320);
  });

  // Geolocation
  document.getElementById("btn-geo").addEventListener("click", () => {
    if (!navigator.geolocation) return alert("Geolocation tidak didukung browser.");
    navigator.geolocation.getCurrentPosition(
      pos => {
        const ll = [pos.coords.latitude, pos.coords.longitude];
        if (STATE.userMarker) map.removeLayer(STATE.userMarker);
        STATE.userMarker = L.circleMarker(ll, {
          radius: 9, color: "#22d3ee", fillColor: "#22d3ee", fillOpacity: .6, weight: 3
        }).addTo(map).bindPopup("📍 Lokasi Anda").openPopup();
        map.flyTo(ll, 15, { duration: 1.2 });
      },
      err => alert("Gagal mendapatkan lokasi: " + err.message)
    );
  });

  // Home
  document.getElementById("btn-home").addEventListener("click", () => {
    document.getElementById("app").classList.add("hidden");
    document.getElementById("landing").classList.remove("hidden");
  });
}

/* ---------- Boot ---------- */
document.getElementById("btn-open-map").addEventListener("click", async () => {
  document.getElementById("landing").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  if (!map) {
    await loadData();
    initMap();
    setupControls();
    setupSearch();
  } else {
    setTimeout(() => map.invalidateSize(), 100);
  }
});
