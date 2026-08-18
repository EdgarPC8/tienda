import{D as V,w as L,E as O,B as K}from"./index-VbdSVpjm.js";import{f as Y}from"./functions-B870EEKc.js";import{p as Q}from"./printHtmlDocument-DtxepP1l.js";const _="[CAJA_POS]",W="[CONTADO]",I="[CREDITO]";function wt({baseNote:t,saleType:e}){const o=e==="credito"?I:W,a=String(t).replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").replace(/\s+/g," ").trim();return`${_} ${o} ${a}`.trim()}function X(t){if(!t)return"—";const e=String(t.notes||""),o=t.customer,a=String((o==null?void 0:o.name)||"").trim();if(!e.includes(_))return a||"—";const r=e.toLowerCase();return r.includes("mostrador")||r.includes("consumidor final")||r.includes("sin datos de cliente")?"Consumidor Final":a||"—"}function tt(t){const e=String((t==null?void 0:t.notes)||"");return!(!e.includes(_)||e.includes(I)||String((t==null?void 0:t.paymentMethod)||"").toLowerCase()==="credito")}function Nt(t){return!tt(t)}function At(t){return t.find(e=>{const o=String(e.name||"").toLowerCase();return o.includes("consumidor")||o.includes("final")})??null}const et=t=>Number(Number(t||0).toFixed(2));function ot(t,e=9){const o=Math.max(0,Math.floor(Number(t)||0));return String(o).padStart(e,"0")}function nt(t,e,o){const a=String(t||"001").padStart(3,"0").slice(0,3),r=String(e||"001").padStart(3,"0").slice(0,3);return`${a}-${r}-${ot(o)}`}function y(t,e=2){return et(t).toFixed(e)}function q(t){const e=Number(t||0);if(!Number.isFinite(e))return"0.00";const o=Number(e.toFixed(4));return Math.round(o*100)===o*100?o.toFixed(2):String(o)}function S(t,e=""){const o=t==null?"":String(t).trim();if(/^\d{40,}$/.test(o))return o;const a=e==null?"":String(e).trim();return/^\d{40,}$/.test(a)?a:o&&!/e[+-]?\d+$/i.test(o)?o:a||""}function at(t){return String(t||"").toLowerCase()==="produccion"?"PRODUCCIÓN":"PRUEBAS"}function it(t){const e=String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");return e.includes("efectivo")||e==="01"?"SIN UTILIZACION DEL SISTEMA FINANCIERO":e.includes("tarjeta")||e==="16"?"TARJETA DE CREDITO":e.includes("transfer")||e.includes("deposito")||e==="20"?"TRANSFERENCIA / DEPOSITO BANCARIO":(e.includes("credito"),"OTROS CON UTILIZACION DEL SISTEMA FINANCIERO")}function dt(t=[]){const e=(t||[]).map(n=>Number(n.taxRate||0)).filter(n=>n>0);if(!e.length)return 0;const o=new Map;e.forEach(n=>o.set(n,(o.get(n)||0)+1));let a=e[0],r=0;return o.forEach((n,d)=>{n>r&&(r=n,a=d)}),a}function Tt(t,e,o=null,a={}){if(!t)return null;const r=(o==null?void 0:o.establishmentCode)||(e==null?void 0:e.establishmentCode)||"001",n=(o==null?void 0:o.emissionPointCode)||(e==null?void 0:e.emissionPointCode)||"001",d=(o==null?void 0:o.sequential)!=null?Number(o.sequential):null,i=S((o==null?void 0:o.accessKey)||(o==null?void 0:o.authorizationNumber)||""),u=S((o==null?void 0:o.authorizationNumber)||(o==null?void 0:o.accessKey)||i,i),f=(o==null?void 0:o.authorizedAt)||null;return{...t,logoUrl:a.logoUrl||t.logoUrl||"",fiscal:{ruc:(e==null?void 0:e.ruc)||"",legalName:(e==null?void 0:e.legalName)||t.businessName||"",tradeName:(e==null?void 0:e.tradeName)||t.businessDescription||"",matrixAddress:(e==null?void 0:e.matrixAddress)||"",establishmentAddress:(e==null?void 0:e.establishmentAddress)||(e==null?void 0:e.matrixAddress)||"",phone:(e==null?void 0:e.phone)||"",email:(e==null?void 0:e.email)||"",accountingRequired:!!(e!=null&&e.accountingRequired),environment:(e==null?void 0:e.environment)||(o==null?void 0:o.environment)||"pruebas",environmentLabel:at((o==null?void 0:o.environment)||(e==null?void 0:e.environment)),establishmentCode:String(r).padStart(3,"0").slice(0,3),emissionPointCode:String(n).padStart(3,"0").slice(0,3),sequential:d,invoiceNumber:d!=null?nt(r,n,d):"",accessKey:i,authorizationNumber:u,authorizedAt:f,emissionDate:f&&String(f).slice(0,10)||t.dateIso&&String(t.dateIso).slice(0,10)||"",status:(o==null?void 0:o.status)||null,fromSettingsPreview:!(o!=null&&o.sequential)}}}function rt(t){return String((t==null?void 0:t.documentType)||"")==="factura"}const lt=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","212113","212311","232111","111213","131113","131311","111133","111331","113131","113113","133111","313111","211331","131131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"],U=104,st=106;function ut(t){const e=[U];let o=U,a=1;for(let r=0;r<t.length;r+=1){const n=t.charCodeAt(r)-32;n<0||n>95||(e.push(n),o+=n*a,a+=1)}return e.push(o%103),e.push(st),e}function ct(t){const e=String(t||"").trim();if(!e)return null;const o=ut(e);let a=0;const r=[];return o.forEach(n=>{const d=lt[n];if(d)for(let i=0;i<d.length;i+=1){const u=Number(d[i]);i%2===0&&r.push({x:a,w:u}),a+=u}}),{width:a,rects:r}}function pt(t,{height:e=42,maxWidth:o=280}={}){const a=ct(t);if(!a)return"";const r=o/a.width,n=e,d=a.rects.map(i=>`<rect x="${(i.x*r).toFixed(2)}" y="0" width="${(i.w*r).toFixed(2)}" height="${n}" fill="#000"/>`).join("");return`<svg xmlns="http://www.w3.org/2000/svg" width="${o}" height="${n}" viewBox="0 0 ${o} ${n}" preserveAspectRatio="none" aria-hidden="true">${d}</svg>`}function p(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function m(t,e,o=!1){return`<div style="margin:0 0 3px;line-height:1.3">
    <strong>${p(t)}</strong>
    <span style="font-weight:${o?800:600};word-break:break-all">${p(e||"—")}</span>
  </div>`}function k(t,{isTicket:e,ivaRate:o}){var f;const a=Number(t.discount||0),r=Number(t.ice||0),n=Number(t.tip||0),d=[["Total Sin Impuestos",y(t.subtotal)],["Descuento",y(a)],["Valor ICE",y(r)],[o>0?`Valor IVA ${o}%`:"Valor IVA",y(t.iva)]];e||d.push(["Propina",y(n)]),d.push(["Valor Total",y(t.total)]);const i=d.map(([x,l],s)=>`<div style="display:flex;justify-content:space-between;gap:8px;${s===d.length-1?"border-top:1px solid #000;margin-top:4px;padding-top:4px;font-weight:900":"font-weight:700"}">
        <span>${p(x)}</span><span>${p(l)}</span>
      </div>`).join(""),u=(f=t.fiscal)!=null&&f.fromSettingsPreview?'<div style="margin-top:6px;font-size:10px;font-weight:700;color:#444">Sin factura SRI vinculada: el Nº se asigna al emitir/autorizar.</div>':"";return`${i}${u}`}function j(t,e){const o=it(t.paymentMethod);return`<div style="font-size:0.9em">
    <div style="font-weight:800;margin-bottom:4px">Información Adicional</div>
    ${e?"":'<div style="font-weight:600;margin-bottom:6px">Sucursal: Matriz</div>'}
    <table style="width:100%;border-collapse:collapse;font-size:0.85em">
      <thead>
        <tr>
          <th style="border:1px solid #000;padding:3px 4px;text-align:left">Forma de Pago</th>
          <th style="border:1px solid #000;padding:3px 4px;text-align:left">Valor</th>
          <th style="border:1px solid #000;padding:3px 4px;text-align:left">Plazo</th>
          <th style="border:1px solid #000;padding:3px 4px;text-align:left">Tiempo</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:600">${p(o)}</td>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:700">${p(y(t.total))}</td>
          <td style="border:1px solid #000;padding:3px 4px"></td>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:600">ninguno</td>
        </tr>
      </tbody>
    </table>
  </div>`}function H(t,e,o){return`<div style="border:1px solid #000;padding:${o?6:8}px;margin-bottom:${o?8:10}px;line-height:1.35">
    ${m("Razón Social/ Nombres:",t.customerName)}
    ${o?`${m("Identificación:",t.customerCedula)}
           ${m("Dirección:",t.customerAddress)}
           ${m("Teléfono:",t.customerPhone)}
           ${m("Correo:",t.customerEmail)}`:`<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
            ${m("Identificación:",t.customerCedula)}
            ${m("Fecha Emisión:",e)}
            ${m("Dirección:",t.customerAddress)}
            ${m("Guía de Remisión:","")}
            ${m("Teléfono:",t.customerPhone)}
            ${m("Correo:",t.customerEmail)}
          </div>`}
  </div>`}function B(t,e,o){const a=t.logoUrl?`<img src="${p(t.logoUrl)}" alt="" style="max-width:${o?120:160}px;max-height:${o?70:90}px;object-fit:contain;margin:0 ${o?"auto":0} 6px;display:block" />`:"";return`<div style="text-align:${o?"center":"left"}">
    ${a}
    <div style="font-weight:900;font-size:${o?"0.95em":"1.05em"};line-height:1.25">${p(e.legalName||t.businessName)}</div>
    ${e.tradeName||t.businessDescription?`<div style="font-weight:700;font-size:${o?"0.85em":"0.95em"};margin-top:2px">${p(e.tradeName||t.businessDescription)}</div>`:""}
    ${e.matrixAddress?`<div style="font-weight:600;font-size:0.82em;margin-top:4px"><strong>Matriz: </strong>${p(e.matrixAddress)}</div>`:""}
    ${e.establishmentAddress?`<div style="font-weight:600;font-size:0.82em"><strong>Sucursal: </strong>${p(e.establishmentAddress)}</div>`:""}
    <div style="font-weight:600;font-size:0.82em;margin-top:3px"><strong>Obligado a llevar Contabilidad: </strong>${e.accountingRequired?"SI":"NO"}</div>
    ${e.phone?`<div style="font-weight:600;font-size:0.82em">${p(e.phone)}</div>`:""}
    ${e.email?`<div style="font-weight:600;font-size:0.82em">${p(e.email)}</div>`:""}
  </div>`}function mt(t,e="a4",o={}){var z,C;if(!t)return"";const a=K(e),r=a.isTicket,n=t.fiscal||{},d=t.items||[],i=V(o.detailSettings??((z=L())==null?void 0:z.receiptDetailSettings)),u=t.documentType||"factura",f=dt(d),x=n.emissionDate||t.date&&((C=String(t.date).match(/\d{4}-\d{2}-\d{2}/))==null?void 0:C[0])||"",l=n.authorizationNumber||n.accessKey||"",s=l?pt(l,{height:r?36:52,maxWidth:r?240:420}):"",g="100%",h=r?a.narrow?"11px":"12.5px":"12pt",$="0",N=r?`<div style="text-align:center">
        <div style="font-weight:900;font-size:1.15em;letter-spacing:0.5px;margin-bottom:6px">FACTURA</div>
        ${m("Ruc:",n.ruc,!0)}
      </div>`:`<div>
        <div style="font-weight:900;font-size:1.35em;letter-spacing:0.5px;margin-bottom:8px;text-align:center">FACTURA</div>
        ${m("RUC:",n.ruc,!0)}
        ${m("No.",n.invoiceNumber,!0)}
        ${m("Ambiente",n.environmentLabel,!0)}
        ${m("Autorización",n.authorizationNumber||"Pendiente de autorización SRI")}
        ${n.authorizedAt?m("Fecha y Hora Autorización",n.authorizedAt):""}
        ${s?`<div style="margin-top:8px">${s}</div>`:""}
      </div>`,A=`<div style="text-align:center;margin-top:6px">
    ${m("Fecha Emisión:",x,!0)}
    ${m("No.",n.invoiceNumber,!0)}
    ${m("Ambiente",n.environmentLabel,!0)}
    ${m("Autorización",n.authorizationNumber||"Pendiente SRI")}
    ${n.authorizedAt?m("Fecha y Hora Autorización",n.authorizedAt):""}
    ${n.accessKey?m("Clave acceso",n.accessKey):""}
  </div>`,T=r?`<div style="margin-bottom:8px">
        <div style="display:grid;grid-template-columns:0.7fr 2.2fr 0.9fr 0.7fr 0.9fr;gap:2px;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:3px;font-weight:800;font-size:0.85em">
          <span>Cant</span><span>Descripción</span><span style="text-align:right">P.V.P</span><span style="text-align:right">Descto</span><span style="text-align:right">Subtotal</span>
        </div>
        ${d.map((c,v)=>`<div style="display:grid;grid-template-columns:0.7fr 2.2fr 0.9fr 0.7fr 0.9fr;gap:2px;padding:3px 0;border-bottom:1px dotted #999;font-weight:600;font-size:0.9em;align-items:start">
              <span>${p(y(c.quantity))}</span>
              <span style="word-break:break-word">${p(O(c,i,v,u))}</span>
              <span style="text-align:right">${p(q(c.price))}</span>
              <span style="text-align:right">${p(y(c.discount||0))}</span>
              <span style="text-align:right">${p(y(c.subtotal??c.lineTotal))}</span>
            </div>`).join("")}
      </div>`:`<table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:0.95em;table-layout:fixed">
        <colgroup>
          <col style="width:12%" />
          <col style="width:38%" />
          <col style="width:10%" />
          <col style="width:15%" />
          <col style="width:10%" />
          <col style="width:15%" />
        </colgroup>
        <thead>
          <tr>
            ${["Codigo","Descripción","Cant","Precio Unitario","Descto","Subtotal"].map((c,v)=>`<th style="border:1px solid #000;padding:5px 6px;font-weight:800;text-align:${v>=2?"right":"left"};background:#f3f3f3">${c}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${d.map((c,v)=>`<tr>
                <td style="border:1px solid #000;padding:3px 5px;font-weight:600">${p(c.code||c.productId||v+1)}</td>
                <td style="border:1px solid #000;padding:3px 5px;font-weight:600">${p(O(c,i,v,u))}</td>
                <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:700">${p(y(c.quantity))}</td>
                <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:700">${p(q(c.price))}</td>
                <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:700">${p(y(c.discount||0))}</td>
                <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:700">${p(y(c.subtotal??c.lineTotal))}</td>
              </tr>`).join("")}
        </tbody>
      </table>`;return r?`<div style="width:${g};max-width:${g};margin:0 auto;padding:${$};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${h};color:#000;line-height:1.3">
      ${N}
      <div style="margin:8px 0">${B(t,n,!0)}</div>
      ${A}
      <div style="border-top:1px solid #000;border-bottom:1px solid #000;padding:4px 0;margin:8px 0"></div>
      ${H(t,x,!0)}
      ${T}
      ${k(t,{isTicket:!0,ivaRate:f})}
      <div style="margin-top:10px">${j(t,!0)}</div>
    </div>`:`<div style="width:${g};max-width:${g};margin:0 auto;padding:${$};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${h};color:#000;line-height:1.3">
    <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:10px;margin-bottom:10px">
      <div style="border:1px solid #000;padding:10px">${B(t,n,!1)}</div>
      <div style="border:1px solid #000;padding:10px">${N}</div>
    </div>
    ${H(t,x,!1)}
    ${T}
    <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:10px;align-items:start">
      <div style="border:1px solid #000;padding:8px">${j(t,!1)}</div>
      <div style="border:1px solid #000;padding:8px">${k(t,{isTicket:!1,ivaRate:f})}</div>
    </div>
  </div>`}const b=t=>Number(Number(t||0).toFixed(2)),D=t=>Number(Number(t||0).toFixed(3)),gt={factura:"Factura",nota_venta:"Nota de venta",documento:"Comprobante",consumidor_final:"Consumidor final"},Ct=[{value:"factura",label:"Factura"},{value:"nota_venta",label:"Nota de venta"},{value:"documento",label:"Comprobante"},{value:"consumidor_final",label:"Consumidor final"}];function P(t){return gt[t]||t||"—"}function F(t){switch(t){case"factura":return"FACTURA";case"nota_venta":return"NOTA DE VENTA";case"consumidor_final":return"CONSUMIDOR FINAL";default:return"COMPROBANTE DE VENTA"}}function Rt(t,e){if(!t)return null;const o=e||t.documentType||"documento",a=t._customerRaw||{};if(o==="consumidor_final")return{...t,documentType:o,documentTypeLabel:P(o),documentTitle:F(o),customerName:"Consumidor Final",customerPhone:"",customerAddress:"",customerEmail:"",customerCedula:""};const r=String(a.name||"").trim()||(t.customerName&&t.customerName!=="Consumidor Final"?t.customerName:"")||"—";return{...t,documentType:o,documentTypeLabel:P(o),documentTitle:F(o),customerName:r,customerPhone:a.phone||t.customerPhone||"",customerAddress:a.address||t.customerAddress||"",customerEmail:a.email||t.customerEmail||"",customerCedula:a.cedula||t.customerCedula||""}}function zt(t,e){return t==="factura"?"factura":t==="nota_venta"?"nota_venta":e?"documento":"consumidor_final"}function E(t){return`$${b(t).toFixed(2)}`}function ft(t){const e=D(t),o=Math.round(e*100)===e*100?2:3;return`$${e.toFixed(o)}`}function xt(t){return Y(t)}const R={name:"Nom:",cedula:"CI:",phone:"Tel:",address:"Dir:",payment:"Pag:"};function ht(t){const e=String(t||"").toLowerCase();return e==="efectivo"?"Efectivo":e==="transferencia"?"Transferencia":e==="tarjeta"?"Tarjeta":e==="credito"?"Crédito":t||"—"}function G(t){if(!t)return null;const e=(t.items||[]).map(l=>({name:l.name||l.productName||"Producto",code:l.code||l.sku||l.barcode||"",barcode:l.barcode||l.code||l.sku||"",unitLabel:l.unitLabel||l.unit||"",productId:l.productId||l.id||null,quantity:Number(l.quantity||0),price:D(l.price),discount:b(l.discount||0),lineTotal:b(l.lineTotal??Number(l.quantity)*Number(l.price)),taxRate:Number(l.taxRate||0),subtotal:b(l.subtotal??l.lineTotal),iva:b(l.iva||0)})),o=b(t.subtotal??e.reduce((l,s)=>l+s.subtotal,0)),a=b(t.iva??e.reduce((l,s)=>l+s.iva,0)),r=b(t.total??e.reduce((l,s)=>l+s.lineTotal,0)),n=t.customer||{},d=t.documentType||"documento",i=X({notes:t.notes||"",customer:n}),u=String(n.name||"").trim()||(i&&i!=="Consumidor Final"?i:""),f=d==="consumidor_final"?"Consumidor Final":u||i||n.name||"—",x=L();return{id:t.id,businessName:x.alias||"App",businessDescription:x.description||"",logoUrl:x.logoUrl||"",documentTitle:F(d),documentType:d,documentTypeLabel:P(d),date:xt(t.date||t.paidAt),dateIso:t.date||t.paidAt||null,customerName:f,customerPhone:n.phone||"",customerAddress:n.address||"",customerEmail:n.email||"",customerCedula:n.cedula||"",_customerRaw:{name:u,phone:n.phone||"",address:n.address||"",email:n.email||"",cedula:n.cedula||""},paymentMethod:ht(t.paymentMethod),items:e,subtotal:o,iva:a,total:r,notes:String(t.notes||"").replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").trim()}}function Et(t){if(!t)return null;const o=(t.ERP_order_items||t.items||[]).map(i=>{var $;const u=Number(i.quantity||0),f=D(i.price),x=b(u*f),l=Number((($=i.ERP_inventory_product)==null?void 0:$.taxRate)||i.taxRate||0);let s=x,g=0;l>0&&(s=b(x/(1+l/100)),g=b(x-s));const h=i.ERP_inventory_product||{};return{name:h.name||i.name||"Producto",code:h.sku||h.barcode||i.code||"",barcode:h.barcode||h.sku||i.code||"",unitLabel:h.unitLabel||h.unit||i.unitLabel||"",productId:i.productId||h.id||null,quantity:u,price:f,discount:0,taxRate:l,subtotal:s,iva:g,lineTotal:x}}),a=o.reduce((i,u)=>i+u.subtotal,0),r=o.reduce((i,u)=>i+u.iva,0),n=o.reduce((i,u)=>i+u.lineTotal,0),d=t.ERP_customer||t.customer||{};return G({id:t.id,date:t.date,paidAt:t.paidAt,paymentMethod:t.paymentMethod||"credito",documentType:t.documentType||"nota_venta",notes:t.notes,customer:d,items:o,subtotal:a,iva:r,total:n})}function Dt({orderId:t,cart:e,customer:o,documentType:a,paymentMethod:r,saleType:n,notes:d}){const i=e.map(s=>{const g=Number(s.quantity||0),h=D(s.price),$=b(g*h),N=Number(s.taxRate||0);let A=$,T=0;return N>0&&(A=b($/(1+N/100)),T=b($-A)),{name:s.name,code:s.sku||s.barcode||s.code||"",barcode:s.barcode||s.sku||s.code||"",unitLabel:s.unitLabel||s.unit||"",productId:s.productId||s.id||null,quantity:g,price:h,discount:0,taxRate:N,subtotal:A,iva:T,lineTotal:$}}),u=i.reduce((s,g)=>s+g.subtotal,0),f=i.reduce((s,g)=>s+g.iva,0),x=i.reduce((s,g)=>s+g.lineTotal,0),l=a;return G({id:t,date:new Date().toISOString(),paidAt:n==="credito"?null:new Date().toISOString(),paymentMethod:n==="credito"?"credito":r,documentType:l,notes:d,customer:o,items:i,subtotal:u,iva:f,total:x})}function Ot(t,e,o={}){const a=rt(t)?mt(t,e,o):bt(t,e,o);Q(a,{format:e})}function bt(t,e,o={}){var C;const{showNotes:a=!0}=o,r=K(e),n=r.isTicket,d=r.print,i=r.productColPct,u=n?"100%":"210mm",f=n?d.fs:"14px",x=n?"0":"24px",l=n?"padding:2px 1px;word-wrap:break-word;overflow-wrap:break-word;white-space:normal;vertical-align:top;line-height:1.35;font-weight:600":"padding:2px 0;font-weight:600",s=n?`text-align:center;padding:2px 1px;vertical-align:top;font-size:${d.num}px;font-weight:700`:"text-align:center;padding:2px 4px;font-weight:700",g=n?`text-align:right;padding:2px 1px;vertical-align:top;font-size:${d.num}px;font-weight:700;word-wrap:break-word;overflow-wrap:break-word`:"text-align:right;padding:2px 0;font-weight:700",h=(c,v,M=!1)=>{const J=M?"font-weight:800;":"font-weight:700;",Z=M?n?`font-size:${d.totalBold}px;`:"font-size:17px;":"";return`<div style="display:table;width:100%;${J}${Z}">
      <span style="display:table-cell;padding:0 1px">${c}</span>
      <span style="display:table-cell;text-align:right;white-space:nowrap;padding:0 1px">${v}</span>
    </div>`},$=n?`<div style="margin-top:10px">
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${d.signature}px">Entrega</div>
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${d.signature}px">Recibe</div>
      </div>`:`<div style="display:flex;justify-content:space-between;gap:32px;margin-top:36px">
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Entrega</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Recibe</div>
        </div>
      </div>`,N=V(o.detailSettings??((C=L())==null?void 0:C.receiptDetailSettings)),A=t.documentType||"nota_venta",T=(t.items||[]).map((c,v)=>`<tr>
          <td style="${l}">${w(O(c,N,v,A))}</td>
          <td style="${s}">${c.quantity}</td>
          <td style="${g}">${ft(c.price)}</td>
          <td style="${g}">${E(c.lineTotal)}</td>
        </tr>`).join(""),z=(t.items||[]).reduce((c,v)=>c+Number(v.quantity||0),0);return`<div style="width:${u};max-width:${u};margin:0 auto;padding:${x};box-sizing:border-box;font-family:Arial,sans-serif;font-size:${f};font-weight:600;color:#000;line-height:1.35;overflow:hidden">
    <div style="text-align:center;margin-bottom:${n?6:16}px">
      <div style="font-weight:800;font-size:${n?d.title:22}px;color:#000">${w(t.businessName)}</div>
      ${t.businessDescription?`<div style="font-weight:800;font-size:${n?d.desc:13}px;color:#000;margin-top:2px">${w(t.businessDescription)}</div>`:""}
      <div style="font-weight:800;margin-top:${n?5:12}px;font-size:${n?d.docTitle:17}px;color:#000">${w(t.documentTitle)}</div>
      <div style="font-weight:800;font-size:${n?d.meta:13}px;color:#000;margin-top:2px">N° ${t.id||"—"}</div>
      <div style="font-weight:900;font-size:${n?d.date:18}px;color:#000;margin-top:3px">${w(t.date)}</div>
    </div>
    <div style="margin-bottom:${n?6:12}px;font-size:${n?d.customer:16}px;font-weight:700;color:#000;line-height:1.4">
      <div style="margin-bottom:${n?2:3}px"><strong>${R.name}</strong> ${w(t.customerName)}</div>
      ${t.customerCedula?`<div style="margin-bottom:${n?2:3}px"><strong>${R.cedula}</strong> ${w(t.customerCedula)}</div>`:""}
      ${t.customerPhone?`<div style="margin-bottom:${n?2:3}px"><strong>${R.phone}</strong> ${w(t.customerPhone)}</div>`:""}
      ${t.customerAddress?`<div style="margin-bottom:${n?2:3}px"><strong>${R.address}</strong> ${w(t.customerAddress)}</div>`:""}
      <div><strong>${R.payment}</strong> ${w(t.paymentMethod)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:${n?6:12}px;color:#000;table-layout:fixed">
      <thead>
        <tr style="border-bottom:1px solid #ccc">
          <th style="text-align:left;padding:2px 1px;font-weight:800;color:#000;width:${n?i.product:"auto"}">Producto</th>
          <th style="text-align:center;padding:2px 1px;font-weight:800;color:#000;width:${n?i.cant:"auto"}">Cant</th>
          <th style="text-align:right;padding:2px 1px;font-weight:800;color:#000;width:${n?i.pu:"auto"}">P.U.</th>
          <th style="text-align:right;padding:2px 1px;font-weight:800;color:#000;width:${n?i.total:"auto"}">Total</th>
        </tr>
      </thead>
      <tbody>${T}</tbody>
      <tfoot>
        <tr style="border-top:1px solid #ccc">
          <td style="text-align:right;padding:3px 1px;font-weight:800;color:#000">Total Cant</td>
          <td style="text-align:center;padding:3px 1px;font-weight:800;color:#000">${z}</td>
          <td style="padding:3px 1px"></td>
          <td style="padding:3px 1px"></td>
        </tr>
      </tfoot>
    </table>
    <div style="border-top:1px dashed #999;padding-top:${n?3:10}px;color:#000">
      ${h("Subtotal",E(t.subtotal))}
      ${t.iva>0?h("IVA",E(t.iva)):""}
      ${h("TOTAL",E(t.total),!0)}
    </div>
    ${a&&t.notes?`<div style="margin-top:${n?4:10}px;font-size:${n?d.notes:12}px;font-weight:700;color:#000;word-wrap:break-word">${w(t.notes)}</div>`:""}
    <div style="text-align:center;margin-top:${n?6:16}px;margin-bottom:0;font-size:${n?d.footer:12}px;font-weight:800;color:#000">Gracias por su compra</div>
    ${$}
  </div>`}function w(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}export{Ct as D,R,Rt as a,Et as b,Ot as c,pt as d,Tt as e,dt as f,y as g,q as h,Nt as i,rt as j,ft as k,E as l,At as m,G as n,wt as o,ht as p,Dt as q,zt as r,it as s,P as t,xt as u};
