import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import type { Product, ProductLocationResult, SpatialNode } from "@spatial/domain";
import { isPositioned } from "@spatial/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, latestVerifiedQuantity, type InventorySourceSummary, type Overview, ApiClientError } from "./api";
import { BarcodeScanner } from "./barcode";
import { parseCsv } from "./csv";

type Locale="en"|"ar";

const copy={
  en:{brand:"Spatial Inventory",tagline:"Search your physical space.",subtag:"Inventory truth stays in the data layer. 3D shows where it is.",online:"Connected",offline:"Offline",find:"Find an item",product:"Products",location:"Locations",source:"Inventory sources",create:"Create",space:"Space",floor:"Floor",zone:"Zone",room:"Room",aisle:"Aisle",rack:"Rack",shelf:"Shelf",cabinet:"Cabinet",drawer:"Drawer",bin:"Bin",box:"Box",slot:"Slot",map3d:"3D",plan2d:"2D plan",edit:"Edit layout",searchPlaceholder:"Product, SKU, barcode, shelf…",noResults:"No matching records.",unpositioned:"No coordinates yet",quantity:"Verified quantity",unknown:"Not currently verified",sourceVerified:"Verified from connected source",noLocation:"No physical placement yet.",breadcrumbs:"Exact place",addLocation:"Add location",addProduct:"Add product",place:"Place product",name:"Name",sku:"SKU",barcode:"Barcode",category:"Category",parent:"Parent location",createLocation:"Create location",createProduct:"Create product",placeProduct:"Place product",choose:"Choose…",importCsv:"Import CSV",sourceForQuantity:"Stock source for imported quantity (optional)",createSource:"Add source",sourceName:"Source name",sourceProvider:"Provider type",csvDone:"Import completed",scan:"Scan barcode",stop:"Stop scanner",camera:"Camera",positionSaved:"Position saved",selected:"Selected",children:"Children",noChildren:"No direct children.",noProducts:"No products in this location.",dataUnavailable:"The API/database is unavailable. Connect the backend and reload.",authRequired:"Production authentication is not configured yet.",errors:"Something went wrong",productCount:"Products",nodeCount:"Spatial objects",placementCount:"Placements",sourceCount:"Sources",language:"العربية",reason:"Movement reason"},
  ar:{brand:"الذاكرة المكانية للمخزون",tagline:"ابحث في مكانك الحقيقي.",subtag:"حقيقة المخزون تبقى في طبقة البيانات، وواجهة 3D تريك أين يوجد.",online:"متصل",offline:"بدون اتصال",find:"ابحث عن صنف",product:"المنتجات",location:"المواقع",source:"مصادر المخزون",create:"إنشاء",space:"مساحة",floor:"طابق",zone:"منطقة",room:"غرفة",aisle:"ممر",rack:"رف تخزين",shelf:"رف",cabinet:"خزانة",drawer:"درج",bin:"حاوية",box:"صندوق",slot:"خانة",map3d:"3D",plan2d:"المخطط 2D",edit:"تعديل المخطط",searchPlaceholder:"اسم المنتج، SKU، الباركود، الرف…",noResults:"لا توجد نتائج مطابقة.",unpositioned:"لا توجد إحداثيات بعد",quantity:"الكمية الموثقة",unknown:"غير موثقة حاليًا",sourceVerified:"موثقة من مصدر مخزون متصل",noLocation:"لا يوجد موقع فعلي مرتبط بعد.",breadcrumbs:"المكان الدقيق",addLocation:"إضافة موقع",addProduct:"إضافة منتج",place:"ربط منتج بموقع",name:"الاسم",sku:"SKU",barcode:"الباركود",category:"الفئة",parent:"الموقع الأب",createLocation:"إنشاء الموقع",createProduct:"إنشاء المنتج",placeProduct:"ربط المنتج",choose:"اختر…",importCsv:"استيراد CSV",sourceForQuantity:"مصدر المخزون للكمية (اختياري)",createSource:"إضافة مصدر",sourceName:"اسم المصدر",sourceProvider:"نوع المصدر",csvDone:"اكتمل الاستيراد",scan:"مسح الباركود",stop:"إيقاف الماسح",camera:"الكاميرا",positionSaved:"تم حفظ الموقع",selected:"المحدد",children:"العناصر التابعة",noChildren:"لا توجد عناصر تابعة مباشرة.",noProducts:"لا توجد منتجات في هذا الموقع.",dataUnavailable:"قاعدة البيانات أو API غير متاحين. شغّل الخلفية ثم أعد التحميل.",authRequired:"مصادقة الإنتاج لم تُضبط بعد.",errors:"حدث خطأ",productCount:"المنتجات",nodeCount:"العناصر المكانية",placementCount:"الربط المكاني",sourceCount:"المصادر",language:"English",reason:"سبب الحركة"}
} as const;

const nodeLabel=(locale:Locale,type:SpatialNode["type"])=>copy[locale][type];

function ProductCard({product,active,onClick}:{product:Product;active:boolean;onClick:()=>void}){
  return <button className={active?"product-card active":"product-card"} onClick={onClick}>
    <span className="product-main">
      {product.imageUrl?<img src={product.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<span className="product-avatar">{product.name.slice(0,1).toUpperCase()}</span>}
      <span><strong>{product.name}</strong><small>{product.sku}{product.barcode? ` · ${product.barcode}`:""}</small></span>
    </span>
    <span className="pill">{product.status}</span>
  </button>;
}

function Scene({nodes,selectedId,onSelect}:{nodes:SpatialNode[];selectedId:string|null;onSelect:(id:string)=>void}){
  const positioned=nodes.filter(isPositioned);
  return <Canvas frameloop="demand" dpr={[1,1.5]} shadows={false} camera={{position:[10,8,11],fov:45}} gl={{antialias:false,powerPreference:"high-performance"}}>
    <ambientLight intensity={1.7}/><directionalLight position={[8,12,8]} intensity={1.4}/>
    <Grid args={[30,30]} cellSize={1} cellThickness={0.4} sectionSize={5} sectionThickness={0.8}/>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.03,0]}><planeGeometry args={[32,32]}/><meshBasicMaterial color="#f8fafc"/></mesh>
    {positioned.map((node)=>{
      const selected=node.id===selectedId;
      const container=["space","floor","zone","room","aisle","rack","cabinet"].includes(node.type);
      return <group key={node.id} position={[node.x,node.y+node.height/2,node.z]} onClick={(event)=>{event.stopPropagation();onSelect(node.id);}}>
        <mesh><boxGeometry args={[Math.max(node.width,.1),Math.max(node.height,.1),Math.max(node.depth,.1)]}/><meshStandardMaterial color={selected?"#0f172a":container?"#94a3b8":"#2563eb"} transparent opacity={selected?1:container?.22:.78} wireframe={container&&!selected}/></mesh>
      </group>;
    })}
    <OrbitControls makeDefault minDistance={4} maxDistance={40} target={[0,0,0]}/>
  </Canvas>;
}

function Plan2D({nodes,selectedId,edit,onSelect,onMoved}:{nodes:SpatialNode[];selectedId:string|null;edit:boolean;onSelect:(id:string)=>void;onMoved:(id:string,x:number,z:number)=>Promise<void>}){
  const [drag,setDrag]=useState<{id:string;startX:number;startZ:number;clientX:number;clientY:number}|null>(null);
  const scale=36,snap=(value:number)=>Math.round(value*2)/2;
  return <div className="plan"><div className="plan-origin"/>
    {nodes.filter(isPositioned).map((node)=>{
      const left=`calc(50% + ${node.x*scale}px)`,top=`calc(50% - ${node.z*scale}px)`;
      const container=["space","floor","zone","room","aisle","rack","cabinet"].includes(node.type);
      return <div key={node.id} className={`plan-node ${node.id===selectedId?"selected":""} ${container?"container":""}`}
        style={{left,top,width:Math.max(14,node.width*scale),height:Math.max(14,node.depth*scale),transform:"translate(-50%,-50%)"}}
        title={node.name}
        onPointerDown={(event)=>{onSelect(node.id);if(!edit)return;event.currentTarget.setPointerCapture(event.pointerId);setDrag({id:node.id,startX:node.x,startZ:node.z,clientX:event.clientX,clientY:event.clientY});}}
        onPointerMove={(event)=>{if(!drag||drag.id!==node.id)return;const dx=(event.clientX-drag.clientX)/scale,dz=-(event.clientY-drag.clientY)/scale;event.currentTarget.style.left=`calc(50% + ${snap(drag.startX+dx)*scale}px)`;event.currentTarget.style.top=`calc(50% - ${snap(drag.startZ+dz)*scale}px)`;}}
        onPointerUp={async(event)=>{if(!drag||drag.id!==node.id)return;const dx=(event.clientX-drag.clientX)/scale,dz=-(event.clientY-drag.clientY)/scale;setDrag(null);await onMoved(node.id,snap(drag.startX+dx),snap(drag.startZ+dz));}}
      ><span>{node.code??node.name}</span></div>;
    })}
  </div>;
}

function BarcodePanel({onFound,onClose,t}:{onFound:(value:string)=>void;onClose:()=>void;t:(key:keyof typeof copy.en)=>string}){
  const videoRef=useRef<HTMLVideoElement>(null),scannerRef=useRef<BarcodeScanner|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    const scanner=new BarcodeScanner();scannerRef.current=scanner;
    if(videoRef.current)scanner.start(videoRef.current,onFound,(e)=>setError(e instanceof Error?e.message:"Camera unavailable")).catch((e)=>setError(e instanceof Error?e.message:"Camera unavailable"));
    return()=>scanner.stop();
  },[onFound]);
  return <div className="scanner"><div className="scanner-head"><strong>{t("scan")}</strong><button onClick={onClose} aria-label="Close">×</button></div><video ref={videoRef} playsInline muted autoPlay/><div className="scanner-status">{error||t("camera")}</div><button className="secondary full" onClick={()=>scannerRef.current?.stop()}>{t("stop")}</button></div>;
}

export function App(){
  const [locale,setLocale]=useState<Locale>("en"),t=(key:keyof typeof copy.en)=>copy[locale][key];
  const [online,setOnline]=useState(navigator.onLine),[nodes,setNodes]=useState<SpatialNode[]>([]),[products,setProducts]=useState<Product[]>([]),[sources,setSources]=useState<InventorySourceSummary[]>([]),[overview,setOverview]=useState<Overview|null>(null);
  const [query,setQuery]=useState(""),[selectedProductId,setSelectedProductId]=useState<string|null>(null),[selectedNodeId,setSelectedNodeId]=useState<string|null>(null),[locations,setLocations]=useState<ProductLocationResult[]>([]),[nodeProducts,setNodeProducts]=useState<Product[]>([]),[view,setView]=useState<"3d"|"2d">("3d"),[edit,setEdit]=useState(false),[showScanner,setShowScanner]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [locationForm,setLocationForm]=useState({type:"shelf",name:"",code:"",parentId:"",x:"",y:"",z:""});
  const [productForm,setProductForm]=useState({sku:"",name:"",barcode:"",category:""});
  const [placementForm,setPlacementForm]=useState({productId:"",spatialNodeId:"",reason:""});
  const [sourceForm,setSourceForm]=useState({name:"",providerType:"csv",locationRef:""});

  useEffect(()=>{const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener("online",on);window.addEventListener("offline",off);return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};},[]);

  const load=async(q="")=>{
    setBusy(true);setError("");
    try{
      const [loadedNodes,loadedProducts,loadedOverview,loadedSources]=await Promise.all([api.spatial(q),api.products(q),api.overview(),api.inventorySources()]);
      setNodes(loadedNodes);setProducts(loadedProducts);setOverview(loadedOverview);setSources(loadedSources);
      localStorage.setItem("spatial-cache",JSON.stringify({nodes:loadedNodes,products:loadedProducts,at:new Date().toISOString()}));
      if(!selectedProductId&&loadedProducts[0])setSelectedProductId(loadedProducts[0].id);
    }catch(e){
      const cached=localStorage.getItem("spatial-cache");
      if(cached){try{const parsed=JSON.parse(cached);setNodes(parsed.nodes??[]);setProducts(parsed.products??[]);setNotice(t("offline"));}catch{}}
      setError(e instanceof ApiClientError&&e.code==="AUTH_REQUIRED"?t("authRequired"):t("dataUnavailable"));
    }finally{setBusy(false);}
  };

  useEffect(()=>{const handle=window.setTimeout(()=>void load(query.trim()),250);return()=>window.clearTimeout(handle);},[query]);

  useEffect(()=>{if(!selectedProductId){setLocations([]);return;}void api.productLocations(selectedProductId).then(setLocations).catch(()=>setLocations([]));},[selectedProductId]);
  useEffect(()=>{if(!selectedNodeId){setNodeProducts([]);return;}void api.spatialProducts(selectedNodeId).then(setNodeProducts).catch(()=>setNodeProducts([]));},[selectedNodeId]);

  const selectedProduct=products.find((p)=>p.id===selectedProductId)??null,selectedNode=nodes.find((n)=>n.id===selectedNodeId)??null;
  const selectedLocation=selectedProductId ? locations.find((item)=>item.placement.spatialNodeId===selectedNodeId)??locations[0]??null:null;
  const unpositioned=nodes.filter((n)=>!isPositioned(n)),children=selectedNode?nodes.filter((n)=>n.parentId===selectedNode.id):[],currentQuantity=selectedLocation?latestVerifiedQuantity(selectedLocation.inventory):null;
  const sortedProducts=useMemo(()=>products.slice(0,60),[products]);

  const selectProduct=async(product:Product)=>{setSelectedProductId(product.id);setSelectedNodeId(null);setNotice("");const result=await api.productLocations(product.id).catch(()=>[]);setLocations(result);if(result[0])setSelectedNodeId(result[0].placement.spatialNodeId);};
  const selectNode=async(id:string)=>{setSelectedNodeId(id);setSelectedProductId(null);setNotice("");const result=await api.spatialProducts(id).catch(()=>[]);setNodeProducts(result);};
  const moveNode=async(id:string,x:number,z:number)=>{if(!online){setError(t("offline"));return;}try{const updated=await api.updateSpatial(id,{x,z});setNodes((current)=>current.map((node)=>node.id===id?updated:node));setNotice(t("positionSaved"));}catch{setError(t("errors"));}};

  const addLocation=async(event:React.FormEvent)=>{event.preventDefault();try{const created=await api.createSpatial({type:locationForm.type,name:locationForm.name,code:locationForm.code||null,parentId:locationForm.parentId||null,...(locationForm.x!==""?{x:Number(locationForm.x)}:{}),...(locationForm.y!==""?{y:Number(locationForm.y)}:{}),...(locationForm.z!==""?{z:Number(locationForm.z)}:{})});setNodes((current)=>[...current,created]);setSelectedNodeId(created.id);setLocationForm({type:"shelf",name:"",code:"",parentId:"",x:"",y:"",z:""});setNotice(t("create"));}catch{setError(t("errors"));}};
  const addProduct=async(event:React.FormEvent)=>{event.preventDefault();try{const created=await api.createProduct(productForm);setProducts((current)=>[created,...current.filter((p)=>p.id!==created.id)]);setSelectedProductId(created.id);setProductForm({sku:"",name:"",barcode:"",category:""});setNotice(t("create"));}catch{setError(t("errors"));}};
  const addPlacement=async(event:React.FormEvent)=>{event.preventDefault();const product=products.find((p)=>p.id===placementForm.productId);if(!product){setError(t("errors"));return;}try{await api.createPlacement(placementForm);await selectProduct(product);setNotice(t("create"));}catch{setError(t("errors"));}};
  const addSource=async(event:React.FormEvent)=>{event.preventDefault();try{const created=await api.createSource({providerType:sourceForm.providerType,name:sourceForm.name,locationRef:sourceForm.locationRef||undefined});setSources((current)=>[...current,created]);setSourceForm({name:"",providerType:"csv",locationRef:""});setNotice(t("createSource"));}catch{setError(t("errors"));}};
  const importCsvFile=async(file:File,sourceId?:string)=>{try{const text=await file.text();const rows=parseCsv(text).map((row)=>{const next:Record<string,unknown>={...row};if(row.Quantity?.trim())next.quantity=Number(row.Quantity);if(row["Location Code"]?.trim())next.locationCode=row["Location Code"];if(row["Product Name"]?.trim())next.name=row["Product Name"];if(row.SKU?.trim())next.sku=row.SKU;return next;});if(!sourceId&&rows.some((row)=>row.quantity!==undefined))throw new Error("Stock source required for quantity");const result=await api.importProducts({rows,sourceId});setNotice(`${t("csvDone")}: ${result.rows} · ${result.created} ${t("create")}`);await load(query);}catch{setError(t("errors"));}};

  return <div className={`app-shell ${locale==="ar"?"rtl":""}`} dir={locale==="ar"?"rtl":"ltr"}>
    <header className="topbar"><div><div className="brand">{t("brand")}</div><h1>{t("tagline")}</h1><p>{t("subtag")}</p></div><div className="top-actions"><span className={online?"connection ok":"connection"}>{online?t("online"):t("offline")}</span><button className="secondary" onClick={()=>setLocale(locale==="en"?"ar":"en")}>{t("language")}</button></div></header>
    <section className="overview-row"><div className="hero-search"><label htmlFor="search">{t("find")}</label><input id="search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={t("searchPlaceholder")}/><button className="secondary scan-btn" onClick={()=>setShowScanner(true)}>{t("scan")}</button></div><div className="stats"><div><strong>{overview?.products??"—"}</strong><span>{t("productCount")}</span></div><div><strong>{overview?.spatial_nodes??"—"}</strong><span>{t("nodeCount")}</span></div><div><strong>{overview?.placements??"—"}</strong><span>{t("placementCount")}</span></div><div><strong>{overview?.inventory_sources??"—"}</strong><span>{t("sourceCount")}</span></div></div></section>
    {error&&<div className="banner danger">{error}<button onClick={()=>{setError("");void load(query)}}>×</button></div>}
    {notice&&<div className="banner">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    <main className="workspace-grid">
      <aside className="sidebar">
        <div className="section-head"><strong>{t("product")}</strong><span>{busy?"…":sortedProducts.length}</span></div>
        <div className="list">{sortedProducts.map((product)=><ProductCard key={product.id} product={product} active={product.id===selectedProductId} onClick={()=>void selectProduct(product)}/>)}</div>
        {!sortedProducts.length&&<p className="empty">{t("noResults")}</p>}
        <form className="compact-form" onSubmit={addProduct}><div className="section-head"><strong>{t("addProduct")}</strong></div><input required value={productForm.name} onChange={(e)=>setProductForm({...productForm,name:e.target.value})} placeholder={t("name")}/><input required value={productForm.sku} onChange={(e)=>setProductForm({...productForm,sku:e.target.value})} placeholder={t("sku")}/><input value={productForm.barcode} onChange={(e)=>setProductForm({...productForm,barcode:e.target.value})} placeholder={t("barcode")}/><input value={productForm.category} onChange={(e)=>setProductForm({...productForm,category:e.target.value})} placeholder={t("category")}/><button className="primary" disabled={!online}>{t("createProduct")}</button></form>
        <form className="compact-form" onSubmit={addLocation}><div className="section-head"><strong>{t("addLocation")}</strong></div><select value={locationForm.type} onChange={(e)=>setLocationForm({...locationForm,type:e.target.value})}>{(["space","floor","zone","room","aisle","rack","shelf","cabinet","drawer","bin","box","slot"] as SpatialNode["type"][]).map((type)=><option key={type} value={type}>{nodeLabel(locale,type)}</option>)}</select><input required value={locationForm.name} onChange={(e)=>setLocationForm({...locationForm,name:e.target.value})} placeholder={t("name")}/><input value={locationForm.code} onChange={(e)=>setLocationForm({...locationForm,code:e.target.value})} placeholder="CODE"/><select value={locationForm.parentId} onChange={(e)=>setLocationForm({...locationForm,parentId:e.target.value})}><option value="">{t("parent")}: {t("choose")}</option>{nodes.map((node)=><option key={node.id} value={node.id}>{node.code??node.name}</option>)}</select><div className="triple"><input inputMode="decimal" value={locationForm.x} onChange={(e)=>setLocationForm({...locationForm,x:e.target.value})} placeholder="X"/><input inputMode="decimal" value={locationForm.y} onChange={(e)=>setLocationForm({...locationForm,y:e.target.value})} placeholder="Y"/><input inputMode="decimal" value={locationForm.z} onChange={(e)=>setLocationForm({...locationForm,z:e.target.value})} placeholder="Z"/></div><button className="primary" disabled={!online}>{t("createLocation")}</button></form>
        <form className="compact-form" onSubmit={addPlacement}><div className="section-head"><strong>{t("place")}</strong></div><select required value={placementForm.productId} onChange={(e)=>setPlacementForm({...placementForm,productId:e.target.value})}><option value="">{t("product")}: {t("choose")}</option>{products.map((p)=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select><select required value={placementForm.spatialNodeId} onChange={(e)=>setPlacementForm({...placementForm,spatialNodeId:e.target.value})}><option value="">{t("location")}: {t("choose")}</option>{nodes.map((n)=><option key={n.id} value={n.id}>{n.code??n.name}</option>)}</select><input value={placementForm.reason} onChange={(e)=>setPlacementForm({...placementForm,reason:e.target.value})} placeholder={t("reason")}/><button className="primary" disabled={!online}>{t("placeProduct")}</button></form>
        <form className="compact-form" onSubmit={addSource}><div className="section-head"><strong>{t("source")}</strong></div><input required value={sourceForm.name} onChange={(e)=>setSourceForm({...sourceForm,name:e.target.value})} placeholder={t("sourceName")}/><input required value={sourceForm.providerType} onChange={(e)=>setSourceForm({...sourceForm,providerType:e.target.value})} placeholder={t("sourceProvider")}/><input value={sourceForm.locationRef} onChange={(e)=>setSourceForm({...sourceForm,locationRef:e.target.value})} placeholder="Location ref"/><button className="secondary" disabled={!online}>{t("createSource")}</button>{sources.map((source)=><div className="source-row" key={source.id}><span>{source.name}</span><small>{source.status}</small></div>)}</form>
        <label className="import-control"><span>{t("importCsv")}</span><input type="file" accept=".csv,text/csv" onChange={(e)=>{const file=e.target.files?.[0];if(file)void importCsvFile(file,sources.find((source)=>source.is_authoritative)?.id)}}/></label>
      </aside>
      <section className="center"><div className="view-toolbar"><div className="segmented"><button className={view==="3d"?"active":""} onClick={()=>setView("3d")}>{t("map3d")}</button><button className={view==="2d"?"active":""} onClick={()=>setView("2d")}>{t("plan2d")}</button></div>{view==="2d"&&<button className={edit?"secondary active-btn":"secondary"} onClick={()=>setEdit(!edit)}>{t("edit")}</button>}</div><div className="visual">{view==="3d"?<Scene nodes={nodes} selectedId={selectedNodeId} onSelect={(id)=>void selectNode(id)}/>:<Plan2D nodes={nodes} selectedId={selectedNodeId} edit={edit} onSelect={(id)=>void selectNode(id)} onMoved={moveNode}/>} {unpositioned.length>0&&<div className="unpositioned">{t("unpositioned")}: {unpositioned.length}</div>}</div></section>
      <aside className="details">
        {selectedProduct&&<div className="detail-card"><div className="section-head"><span>{t("selected")}</span><span className="pill">{selectedProduct.status}</span></div><h2>{selectedProduct.name}</h2><p>{selectedProduct.sku}{selectedProduct.barcode? ` · ${selectedProduct.barcode}`:""}</p>{selectedLocation?<><div className="trust"><span>{t("quantity")}</span><strong>{currentQuantity??t("unknown")}</strong>{currentQuantity!==null&&<small>{t("sourceVerified")}</small>}</div><div className="section-head"><span>{t("breadcrumbs")}</span></div><div className="crumbs">{selectedLocation.breadcrumb.map((node)=><span key={node.id}>{node.code??node.name}</span>)}</div></>:<div className="empty">{t("noLocation")}</div>}</div>}
        {selectedNode&&<div className="detail-card"><div className="section-head"><span>{t("selected")}</span><span className="pill">{nodeLabel(locale,selectedNode.type)}</span></div><h2>{selectedNode.code??selectedNode.name}</h2><p>{selectedNode.name}</p><div className="detail-grid"><span>X <b>{selectedNode.x??"—"}</b></span><span>Y <b>{selectedNode.y??"—"}</b></span><span>Z <b>{selectedNode.z??"—"}</b></span></div><div className="section-head"><span>{t("children")}</span></div>{children.length?<div className="mini-list">{children.map((child)=><button key={child.id} onClick={()=>void selectNode(child.id)}>{child.code??child.name}</button>)}</div>:<div className="empty">{t("noChildren")}</div>}<div className="section-head"><span>{t("product")}</span></div>{nodeProducts.length?nodeProducts.map((p)=><ProductCard key={p.id} product={p} active={p.id===selectedProductId} onClick={()=>void selectProduct(p)}/>):<div className="empty">{t("noProducts")}</div>}</div>}
      </aside>
    </main>
    {showScanner&&<BarcodePanel t={t} onClose={()=>setShowScanner(false)} onFound={(value)=>{setQuery(value);setShowScanner(false);}}/>}
  </div>;
}
