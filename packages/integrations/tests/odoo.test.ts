import { afterEach, describe, expect, it, vi } from "vitest";
import { OdooConnector } from "../src/odoo";
import { assertSafeOutboundUrl, isPrivateAddress } from "../src/outbound-url";

process.env.INTEGRATION_ALLOWED_HOSTS = "odoo.example.test";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("outbound URL policy", () => {
  it("rejects insecure and local addresses", async () => {
    await expect(assertSafeOutboundUrl("http://odoo.example.test")).rejects.toThrow(/HTTPS/);
    await expect(assertSafeOutboundUrl("https://127.0.0.1")).rejects.toThrow(/private|local/i);
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("allows an explicitly trusted hostname", async () => {
    await expect(assertSafeOutboundUrl("https://odoo.example.test")).resolves.toBeInstanceOf(URL);
  });
});

describe("Odoo JSON-2 connector", () => {
  it("maps products, locations and stock and sends the bearer token", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string,string>;
      expect(url).toMatch(/^https:\/\/odoo\.example\.test\/json\/2\//);
      expect(headers.authorization).toBe("bearer secret");

      if (url.endsWith("/res.users/context_get")) return new Response("{}", {status:200});
      if (url.endsWith("/product.product/search_read")) {
        return new Response(JSON.stringify([{id:1,default_code:"SKU-1",barcode:"111",name:"Cable",categ_id:[7,"Hardware"]}]), {status:200});
      }
      if (url.endsWith("/stock.location/search_read")) {
        return new Response(JSON.stringify([{id:20,name:"Shelf A",complete_name:"WH/Shelf A",location_id:[2,"WH"],usage:"internal",active:true}]), {status:200});
      }
      if (url.endsWith("/stock.quant/search_read")) {
        return new Response(JSON.stringify([{id:30,product_id:[1,"Cable"],location_id:[20,"Shelf A"],quantity:12.5,reserved_quantity:2.5}]), {status:200});
      }
      return new Response(JSON.stringify({unexpected:url}), {status:404});
    });
    vi.stubGlobal("fetch", fetchMock);

    const connector = new OdooConnector({baseUrl:"https://odoo.example.test",apiKey:"secret",database:"demo"});
    expect((await connector.health({tenantId:"t",sourceId:"s"})).status).toBe("connected");
    expect((await connector.listProducts({tenantId:"t",sourceId:"s"}))[0]).toMatchObject({
      sku:"SKU-1",barcode:"111",category:"Hardware"
    });
    expect((await connector.listLocations({tenantId:"t",sourceId:"s"}))[0]).toMatchObject({
      externalLocationId:"20",parentExternalLocationId:"2",completeName:"WH/Shelf A",usage:"internal"
    });
    expect((await connector.listStock({tenantId:"t",sourceId:"s"}))[0]).toMatchObject({
      quantity:12.5,availableQuantity:10,reservedQuantity:2.5,externalLocationId:"20"
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
