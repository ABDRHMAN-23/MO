import { describe, expect, it } from "vitest";
import { breadcrumb, isPositioned, normalizeSearchInput, searchTokens } from "../src/index";

const node = (id:string,parentId:string|null,name:string,code:string|null) => ({
  id:id as never,
  tenantId:"tenant" as never,
  parentId:parentId as never,
  floorId:null,
  type:"shelf" as const,
  name,
  code,
  x:1,
  y:2,
  z:3,
  width:1,
  height:1,
  depth:1,
  rotationX:0,
  rotationY:0,
  rotationZ:0,
  metadata:{},
  deletedAt:null
});

describe("domain helpers",()=>{
  it("builds a stable breadcrumb",()=>{
    const nodes=[
      {...node("a",null,"Warehouse","W")},
      {...node("b","a","Rack 01","R01")},
      {...node("c","b","Shelf 01","S01")}
    ];
    expect(breadcrumb(nodes,"c").map((item)=>item.code)).toEqual(["W","R01","S01"]);
  });

  it("protects breadcrumb traversal against malformed cycles",()=>{
    const nodes=[
      {...node("a","b","A","A")},
      {...node("b","a","B","B")}
    ];
    expect(breadcrumb(nodes,"a").map((item)=>item.id)).toEqual(["b","a"]);
  });

  it("normalizes common Arabic search variants",()=>{
    expect(normalizeSearchInput("  أَكْسِير ديور ـ  ")).toBe("اكسير ديور");
    expect(searchTokens(" أَكْسِير  ديور ")).toEqual(["اكسير","ديور"]);
  });

  it("only treats complete coordinates as positionable",()=>{
    expect(isPositioned(node("x",null,"X","X"))).toBe(true);
    expect(isPositioned({...node("y",null,"Y","Y"),x:null})).toBe(false);
  });
});
