import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Html } from "@react-three/drei";
import { useMemo, useState } from "react";

type Bin = { id: string; label: string; x: number; z: number; color: string; quantity: number };

const bins: Bin[] = [
  { id: "BIN-A01", label: "A-01", x: -3.2, z: -1.5, color: "#2563eb", quantity: 42 },
  { id: "BIN-A02", label: "A-02", x: -1.1, z: -1.5, color: "#16a34a", quantity: 18 },
  { id: "BIN-B01", label: "B-01", x: 1.1, z: -1.5, color: "#f59e0b", quantity: 7 },
  { id: "BIN-B02", label: "B-02", x: 3.2, z: -1.5, color: "#9333ea", quantity: 63 },
  { id: "BIN-C01", label: "C-01", x: -3.2, z: 1.5, color: "#0891b2", quantity: 12 },
  { id: "BIN-C02", label: "C-02", x: -1.1, z: 1.5, color: "#dc2626", quantity: 31 },
  { id: "BIN-D01", label: "D-01", x: 1.1, z: 1.5, color: "#65a30d", quantity: 5 },
  { id: "BIN-D02", label: "D-02", x: 3.2, z: 1.5, color: "#db2777", quantity: 26 }
];

function BinMesh({ bin, selected, onSelect }: { bin: Bin; selected: boolean; onSelect: () => void }) {
  return (
    <group position={[bin.x, 0.65, bin.z]} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <mesh castShadow>
        <boxGeometry args={[1.55, 1.3, 1.2]} />
        <meshStandardMaterial color={selected ? "#111827" : bin.color} />
      </mesh>
      <Html position={[0, 0.9, 0]} center distanceFactor={7}>
        <div className={selected ? "tag selected" : "tag"}>{bin.label}</div>
      </Html>
    </group>
  );
}

function Scene({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 9, 6]} intensity={2} castShadow />
      <Grid args={[12, 12]} cellSize={1} cellThickness={0.7} sectionSize={3} sectionThickness={1.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[11, 8]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {bins.map((bin) => (
        <BinMesh key={bin.id} bin={bin} selected={selectedId === bin.id} onSelect={() => onSelect(bin.id)} />
      ))}
      <OrbitControls makeDefault minDistance={5} maxDistance={20} />
    </>
  );
}

export function App() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>("BIN-A01");
  const filtered = useMemo(() => bins.filter((b) =>
    !query || b.label.toLowerCase().includes(query.toLowerCase()) || b.id.toLowerCase().includes(query.toLowerCase())
  ), [query]);
  const selected = bins.find((b) => b.id === selectedId) ?? null;

  return (
    <main className="app">
      <header>
        <div>
          <span className="eyebrow">SPATIAL INVENTORY</span>
          <h1>Find it. Know where it is.</h1>
          <p>Physical storage mapped into a searchable spatial memory.</p>
        </div>
        <div className="status">CORE ONLINE</div>
      </header>

      <section className="workspace">
        <aside className="panel">
          <label htmlFor="search">Search location</label>
          <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Bin, shelf, barcode…" />
          <div className="results">
            {filtered.map((bin) => (
              <button key={bin.id} className={selectedId === bin.id ? "result active" : "result"} onClick={() => setSelectedId(bin.id)}>
                <span>{bin.label}</span><strong>{bin.quantity}</strong>
              </button>
            ))}
          </div>
          {selected && (
            <div className="detail">
              <span>VERIFIED LOCATION</span>
              <h2>{selected.label}</h2>
              <p>Zone A · Rack 01 · Bin {selected.label}</p>
              <div className="quantity"><strong>{selected.quantity}</strong><span>units</span></div>
              <small>Inventory quantity is a data-layer value; the spatial engine never invents stock.</small>
            </div>
          )}
        </aside>

        <div className="canvas">
          <Canvas shadows camera={{ position: [8, 8, 9], fov: 45 }}>
            <Scene selectedId={selectedId} onSelect={setSelectedId} />
          </Canvas>
          <div className="legend">Drag to orbit · Scroll to zoom · Click a bin to inspect</div>
        </div>
      </section>
    </main>
  );
}
