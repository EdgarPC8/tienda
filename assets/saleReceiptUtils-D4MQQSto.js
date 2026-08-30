import{D as V,w as L,E as P,B}from"./index-yBf1FYse.js";import{f as Z}from"./functions-yAn4m1Xr.js";import{p as W}from"./printHtmlDocument-DqRhU8st.js";import{c as Y}from"./code128Barcode-D2KDP90S.js";const _="[CAJA_POS]",Q="[CONTADO]",K="[CREDITO]";function ht({baseNote:t,saleType:e}){const o=e==="credito"?K:Q,l=String(t||"").replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").replace(/\s+/g," ").trim();return`${_} ${o} ${l}`.trim()}function X(t){if(!t)return"—";const e=String(t.notes||""),o=t.customer,l=String((o==null?void 0:o.name)||"").trim();if(!e.includes(_))return l||"—";const s=e.toLowerCase();return s.includes("mostrador")||s.includes("consumidor final")||s.includes("sin datos de cliente")?"Consumidor Final":l||"—"}function tt(t){const e=String((t==null?void 0:t.notes)||"");return!(!e.includes(_)||e.includes(K)||String((t==null?void 0:t.paymentMethod)||"").toLowerCase()==="credito")}function yt(t){return!tt(t)}function $t(t){return t.find(e=>{const o=String(e.name||"").toLowerCase();return o.includes("consumidor")||o.includes("final")})??null}const et=t=>Number(Number(t||0).toFixed(2));function ot(t,e=9){const o=Math.max(0,Math.floor(Number(t)||0));return String(o).padStart(e,"0")}function nt(t,e,o){const l=String(t||"001").padStart(3,"0").slice(0,3),s=String(e||"001").padStart(3,"0").slice(0,3);return`${l}-${s}-${ot(o)}`}function v(t,e=2){return et(t).toFixed(e)}function q(t){const e=Number(t||0);if(!Number.isFinite(e))return"0.00";const o=Number(e.toFixed(4));return Math.round(o*100)===o*100?o.toFixed(2):String(o)}function k(t,e=""){const o=t==null?"":String(t).trim();if(/^\d{40,}$/.test(o))return o;const l=e==null?"":String(e).trim();return/^\d{40,}$/.test(l)?l:o&&!/e[+-]?\d+$/i.test(o)?o:l||""}function at(t){return String(t||"").toLowerCase()==="produccion"?"PRODUCCIÓN":"PRUEBAS"}function it(t){const e=String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");return e.includes("efectivo")||e==="01"?"SIN UTILIZACION DEL SISTEMA FINANCIERO":e.includes("tarjeta")||e==="16"?"TARJETA DE CREDITO":e.includes("transfer")||e.includes("deposito")||e==="20"?"TRANSFERENCIA / DEPOSITO BANCARIO":(e.includes("credito"),"OTROS CON UTILIZACION DEL SISTEMA FINANCIERO")}function dt(t=[]){const e=(t||[]).map(n=>Number(n.taxRate||0)).filter(n=>n>0);if(!e.length)return 0;const o=new Map;e.forEach(n=>o.set(n,(o.get(n)||0)+1));let l=e[0],s=0;return o.forEach((n,a)=>{n>s&&(s=n,l=a)}),l}function vt(t,e,o=null,l={}){if(!t)return null;const s=(o==null?void 0:o.establishmentCode)||(e==null?void 0:e.establishmentCode)||"001",n=(o==null?void 0:o.emissionPointCode)||(e==null?void 0:e.emissionPointCode)||"001",a=(o==null?void 0:o.sequential)!=null?Number(o.sequential):null,r=k((o==null?void 0:o.accessKey)||(o==null?void 0:o.authorizationNumber)||""),c=k((o==null?void 0:o.authorizationNumber)||(o==null?void 0:o.accessKey)||r,r),p=(o==null?void 0:o.authorizedAt)||null;return{...t,logoUrl:l.logoUrl||t.logoUrl||"",fiscal:{ruc:(e==null?void 0:e.ruc)||"",legalName:(e==null?void 0:e.legalName)||t.businessName||"",tradeName:(e==null?void 0:e.tradeName)||t.businessDescription||"",matrixAddress:(e==null?void 0:e.matrixAddress)||"",establishmentAddress:(e==null?void 0:e.establishmentAddress)||(e==null?void 0:e.matrixAddress)||"",phone:(e==null?void 0:e.phone)||"",email:(e==null?void 0:e.email)||"",accountingRequired:!!(e!=null&&e.accountingRequired),environment:(e==null?void 0:e.environment)||(o==null?void 0:o.environment)||"pruebas",environmentLabel:at((o==null?void 0:o.environment)||(e==null?void 0:e.environment)),establishmentCode:String(s).padStart(3,"0").slice(0,3),emissionPointCode:String(n).padStart(3,"0").slice(0,3),sequential:a,invoiceNumber:a!=null?nt(s,n,a):"",accessKey:r,authorizationNumber:c,authorizedAt:p,emissionDate:p&&String(p).slice(0,10)||t.dateIso&&String(t.dateIso).slice(0,10)||"",status:(o==null?void 0:o.status)||null,fromSettingsPreview:!(o!=null&&o.sequential)}}}function lt(t){return String((t==null?void 0:t.documentType)||"")==="factura"}function m(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function g(t,e,o=!1){return`<div style="margin:0 0 3px;line-height:1.3">
    <strong>${m(t)}</strong>
    <span style="font-weight:${o?800:600};word-break:break-all">${m(e||"—")}</span>
  </div>`}function U(t,{isTicket:e,ivaRate:o}){var p;const l=Number(t.discount||0),s=Number(t.ice||0),n=Number(t.tip||0),a=[["Total Sin Impuestos",v(t.subtotal)],["Descuento",v(l)],["Valor ICE",v(s)],[o>0?`Valor IVA ${o}%`:"Valor IVA",v(t.iva)]];e||a.push(["Propina",v(n)]),a.push(["Valor Total",v(t.total)]);const r=a.map(([h,y],i)=>`<div style="display:flex;justify-content:space-between;gap:8px;${i===a.length-1?"border-top:1px solid #000;margin-top:4px;padding-top:4px;font-weight:900":"font-weight:700"}">
        <span>${m(h)}</span><span>${m(y)}</span>
      </div>`).join(""),c=(p=t.fiscal)!=null&&p.fromSettingsPreview?'<div style="margin-top:6px;font-size:10px;font-weight:700;color:#444">Sin factura SRI vinculada: el Nº se asigna al emitir/autorizar.</div>':"";return`${r}${c}`}function S(t,e){const o=it(t.paymentMethod);return`<div style="font-size:0.9em">
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
          <td style="border:1px solid #000;padding:3px 4px;font-weight:600">${m(o)}</td>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:700">${m(v(t.total))}</td>
          <td style="border:1px solid #000;padding:3px 4px"></td>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:600">ninguno</td>
        </tr>
      </tbody>
    </table>
  </div>`}function j(t,e,o){return`<div style="border:1px solid #000;padding:${o?6:8}px;margin-bottom:${o?8:10}px;line-height:1.35">
    ${g("Razón Social/ Nombres:",t.customerName)}
    ${o?`${g("Identificación:",t.customerCedula)}
           ${g("Dirección:",t.customerAddress)}
           ${g("Teléfono:",t.customerPhone)}
           ${g("Correo:",t.customerEmail)}`:`<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
            ${g("Identificación:",t.customerCedula)}
            ${g("Fecha Emisión:",e)}
            ${g("Dirección:",t.customerAddress)}
            ${g("Guía de Remisión:","")}
            ${g("Teléfono:",t.customerPhone)}
            ${g("Correo:",t.customerEmail)}
          </div>`}
  </div>`}function H(t,e,o){const l=t.logoUrl?`<img src="${m(t.logoUrl)}" alt="" style="max-width:${o?120:160}px;max-height:${o?70:90}px;object-fit:contain;margin:0 ${o?"auto":0} 6px;display:block" />`:"";return`<div style="text-align:${o?"center":"left"}">
    ${l}
    <div style="font-weight:900;font-size:${o?"0.95em":"1.05em"};line-height:1.25">${m(e.legalName||t.businessName)}</div>
    ${e.tradeName||t.businessDescription?`<div style="font-weight:700;font-size:${o?"0.85em":"0.95em"};margin-top:2px">${m(e.tradeName||t.businessDescription)}</div>`:""}
    ${e.matrixAddress?`<div style="font-weight:600;font-size:0.82em;margin-top:4px"><strong>Matriz: </strong>${m(e.matrixAddress)}</div>`:""}
    ${e.establishmentAddress?`<div style="font-weight:600;font-size:0.82em"><strong>Sucursal: </strong>${m(e.establishmentAddress)}</div>`:""}
    <div style="font-weight:600;font-size:0.82em;margin-top:3px"><strong>Obligado a llevar Contabilidad: </strong>${e.accountingRequired?"SI":"NO"}</div>
    ${e.phone?`<div style="font-weight:600;font-size:0.82em">${m(e.phone)}</div>`:""}
    ${e.email?`<div style="font-weight:600;font-size:0.82em">${m(e.email)}</div>`:""}
  </div>`}function rt(t,e="a4",o={}){var w,C;if(!t)return"";const l=B(e),s=l.isTicket,n=t.fiscal||{},a=t.items||[],r=V(o.detailSettings??((w=L())==null?void 0:w.receiptDetailSettings)),c=t.documentType||"factura",p=dt(a),h=n.emissionDate||t.date&&((C=String(t.date).match(/\d{4}-\d{2}-\d{2}/))==null?void 0:C[0])||"",y=n.authorizationNumber||n.accessKey||"",i=y?Y(y,{height:s?36:52,maxWidth:s?240:420}):"",f="100%",b=s?l.narrow?"11px":"12.5px":"12pt",d="0",$=s?`<div style="text-align:center">
        <div style="font-weight:900;font-size:1.15em;letter-spacing:0.5px;margin-bottom:6px">FACTURA</div>
        ${g("Ruc:",n.ruc,!0)}
      </div>`:`<div>
        <div style="font-weight:900;font-size:1.35em;letter-spacing:0.5px;margin-bottom:8px;text-align:center">FACTURA</div>
        ${g("RUC:",n.ruc,!0)}
        ${g("No.",n.invoiceNumber,!0)}
        ${g("Ambiente",n.environmentLabel,!0)}
        ${g("Autorización",n.authorizationNumber||"Pendiente de autorización SRI")}
        ${n.authorizedAt?g("Fecha y Hora Autorización",n.authorizedAt):""}
        ${i?`<div style="margin-top:8px">${i}</div>`:""}
      </div>`,R=`<div style="text-align:center;margin-top:6px">
    ${g("Fecha Emisión:",h,!0)}
    ${g("No.",n.invoiceNumber,!0)}
    ${g("Ambiente",n.environmentLabel,!0)}
    ${g("Autorización",n.authorizationNumber||"Pendiente SRI")}
    ${n.authorizedAt?g("Fecha y Hora Autorización",n.authorizedAt):""}
    ${n.accessKey?g("Clave acceso",n.accessKey):""}
  </div>`,T=s?`<div style="margin-bottom:8px">
        <div style="display:grid;grid-template-columns:0.7fr 2.2fr 0.9fr 0.7fr 0.9fr;gap:2px;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:3px;font-weight:800;font-size:0.85em">
          <span>Cant</span><span>Descripción</span><span style="text-align:right">P.V.P</span><span style="text-align:right">Descto</span><span style="text-align:right">Subtotal</span>
        </div>
        ${a.map((u,N)=>`<div style="display:grid;grid-template-columns:0.7fr 2.2fr 0.9fr 0.7fr 0.9fr;gap:2px;padding:3px 0;border-bottom:1px dotted #999;font-weight:600;font-size:0.9em;align-items:start">
              <span>${m(v(u.quantity))}</span>
              <span style="word-break:break-word">${m(P(u,r,N,c))}</span>
              <span style="text-align:right">${m(q(u.price))}</span>
              <span style="text-align:right">${m(v(u.discount||0))}</span>
              <span style="text-align:right">${m(v(u.subtotal??u.lineTotal))}</span>
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
            ${["Codigo","Descripción","Cant","Precio Unitario","Descto","Subtotal"].map((u,N)=>`<th style="border:1px solid #000;padding:5px 6px;font-weight:800;text-align:${N>=2?"right":"left"};background:#f3f3f3">${u}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${a.map((u,N)=>`<tr>
                <td style="border:1px solid #000;padding:3px 5px;font-weight:600">${m(u.code||u.productId||N+1)}</td>
                <td style="border:1px solid #000;padding:3px 5px;font-weight:600">${m(P(u,r,N,c))}</td>
                <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:700">${m(v(u.quantity))}</td>
                <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:700">${m(q(u.price))}</td>
                <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:700">${m(v(u.discount||0))}</td>
                <td style="border:1px solid #000;padding:3px 5px;text-align:right;font-weight:700">${m(v(u.subtotal??u.lineTotal))}</td>
              </tr>`).join("")}
        </tbody>
      </table>`;return s?`<div style="width:${f};max-width:${f};margin:0 auto;padding:${d};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${b};color:#000;line-height:1.3">
      ${$}
      <div style="margin:8px 0">${H(t,n,!0)}</div>
      ${R}
      <div style="border-top:1px solid #000;border-bottom:1px solid #000;padding:4px 0;margin:8px 0"></div>
      ${j(t,h,!0)}
      ${T}
      ${U(t,{isTicket:!0,ivaRate:p})}
      <div style="margin-top:10px">${S(t,!0)}</div>
    </div>`:`<div style="width:${f};max-width:${f};margin:0 auto;padding:${d};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${b};color:#000;line-height:1.3">
    <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:10px;margin-bottom:10px">
      <div style="border:1px solid #000;padding:10px">${H(t,n,!1)}</div>
      <div style="border:1px solid #000;padding:10px">${$}</div>
    </div>
    ${j(t,h,!1)}
    ${T}
    <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:10px;align-items:start">
      <div style="border:1px solid #000;padding:8px">${S(t,!1)}</div>
      <div style="border:1px solid #000;padding:8px">${U(t,{isTicket:!1,ivaRate:p})}</div>
    </div>
  </div>`}const x=t=>Number(Number(t||0).toFixed(2)),E=t=>Number(Number(t||0).toFixed(3)),st={factura:"Factura",nota_venta:"Nota de venta",documento:"Comprobante",consumidor_final:"Consumidor final"},Nt=[{value:"factura",label:"Factura"},{value:"nota_venta",label:"Nota de venta"},{value:"documento",label:"Comprobante"},{value:"consumidor_final",label:"Consumidor final"}];function O(t){return st[t]||t||"—"}function F(t){switch(t){case"factura":return"FACTURA";case"nota_venta":return"NOTA DE VENTA";case"consumidor_final":return"CONSUMIDOR FINAL";default:return"COMPROBANTE DE VENTA"}}function At(t,e){if(!t)return null;const o=e||t.documentType||"documento",l=t._customerRaw||{};if(o==="consumidor_final")return{...t,documentType:o,documentTypeLabel:O(o),documentTitle:F(o),customerName:"Consumidor Final",customerPhone:"",customerAddress:"",customerEmail:"",customerCedula:""};const s=String(l.name||"").trim()||(t.customerName&&t.customerName!=="Consumidor Final"?t.customerName:"")||"—";return{...t,documentType:o,documentTypeLabel:O(o),documentTitle:F(o),customerName:s,customerPhone:l.phone||t.customerPhone||"",customerAddress:l.address||t.customerAddress||"",customerEmail:l.email||t.customerEmail||"",customerCedula:l.cedula||t.customerCedula||""}}function Tt(t,e){return t==="factura"?"factura":t==="nota_venta"?"nota_venta":e?"documento":"consumidor_final"}function D(t){return`$${x(t).toFixed(2)}`}function ut(t){const e=E(t),o=Math.round(e*100)===e*100?2:3;return`$${e.toFixed(o)}`}function ct(t){return Z(t)}const z={name:"Nom:",cedula:"CI:",phone:"Tel:",address:"Dir:",payment:"Pag:"};function mt(t){const e=String(t||"").toLowerCase();return e==="efectivo"?"Efectivo":e==="transferencia"?"Transferencia":e==="tarjeta"?"Tarjeta":e==="credito"?"Crédito":t||"—"}function I(t){if(!t)return null;const e=(t.items||[]).map(i=>({name:i.name||i.productName||"Producto",code:i.code||i.sku||i.barcode||"",barcode:i.barcode||i.code||i.sku||"",unitLabel:i.unitLabel||i.unit||"",productId:i.productId||i.id||null,quantity:Number(i.quantity||0),price:E(i.price),discount:x(i.discount||0),lineTotal:x(i.lineTotal??Number(i.quantity)*Number(i.price)),taxRate:Number(i.taxRate||0),subtotal:x(i.subtotal??i.lineTotal),iva:x(i.iva||0)})),o=x(t.subtotal??e.reduce((i,f)=>i+f.subtotal,0)),l=x(t.iva??e.reduce((i,f)=>i+f.iva,0)),s=x(t.total??e.reduce((i,f)=>i+f.lineTotal,0)),n=x(t.discount??e.reduce((i,f)=>i+Number(f.discount||0),0)),a=t.customer||{},r=t.documentType||"documento",c=X({notes:t.notes||"",customer:a}),p=String(a.name||"").trim()||(c&&c!=="Consumidor Final"?c:""),h=r==="consumidor_final"?"Consumidor Final":p||c||a.name||"—",y=L();return{id:t.id,businessName:y.alias||"App",businessDescription:y.description||"",logoUrl:y.logoUrl||"",documentTitle:F(r),documentType:r,documentTypeLabel:O(r),date:ct(t.date||t.paidAt),dateIso:t.date||t.paidAt||null,customerName:h,customerPhone:a.phone||"",customerAddress:a.address||"",customerEmail:a.email||"",customerCedula:a.cedula||"",_customerRaw:{name:p,phone:a.phone||"",address:a.address||"",email:a.email||"",cedula:a.cedula||""},paymentMethod:mt(t.paymentMethod),items:e,subtotal:o,iva:l,total:s,discount:n,ticketDiscountPercent:Number(t.ticketDiscountPercent||0),notes:String(t.notes||"").replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").trim()}}function Ct(t){if(!t)return null;const o=(t.ERP_order_items||t.items||[]).map(r=>{var d;const c=Number(r.quantity||0),p=E(r.price),h=x(c*p),y=Number(((d=r.ERP_inventory_product)==null?void 0:d.taxRate)||r.taxRate||0);let i=h,f=0;y>0&&(i=x(h/(1+y/100)),f=x(h-i));const b=r.ERP_inventory_product||{};return{name:b.name||r.name||"Producto",code:b.sku||b.barcode||r.code||"",barcode:b.barcode||b.sku||r.code||"",unitLabel:b.unitLabel||b.unit||r.unitLabel||"",productId:r.productId||b.id||null,quantity:c,price:p,discount:0,taxRate:y,subtotal:i,iva:f,lineTotal:h}}),l=o.reduce((r,c)=>r+c.subtotal,0),s=o.reduce((r,c)=>r+c.iva,0),n=o.reduce((r,c)=>r+c.lineTotal,0),a=t.ERP_customer||t.customer||{};return I({id:t.id,date:t.date,paidAt:t.paidAt,paymentMethod:t.paymentMethod||"credito",documentType:t.documentType||"nota_venta",notes:t.notes,customer:a,items:o,subtotal:l,iva:s,total:n})}function wt({orderId:t,cart:e,customer:o,documentType:l,paymentMethod:s,saleType:n,notes:a,ticketDiscountPercent:r=0,discountTotal:c=0}){const p=e.map(d=>{const $=Number(d.quantity||0),R=E(d.price),T=d.lineTotal!=null&&Number.isFinite(Number(d.lineTotal))?x(d.lineTotal):x($*R),w=Number(d.taxRate||0);let C=d.subtotal!=null&&Number.isFinite(Number(d.subtotal))?x(d.subtotal):T,u=d.iva!=null&&Number.isFinite(Number(d.iva))?x(d.iva):0;return d.subtotal==null&&w>0&&(C=x(T/(1+w/100)),u=x(T-C)),{name:d.name,code:d.sku||d.barcode||d.code||"",barcode:d.barcode||d.sku||d.code||"",unitLabel:d.unitLabel||d.unit||"",productId:d.productId||d.id||null,quantity:$,price:R,discount:x(d.discount||0),discountPercent:Number(d.discountPercent||0),taxRate:w,subtotal:C,iva:u,lineTotal:T}}),h=p.reduce((d,$)=>d+$.subtotal,0),y=p.reduce((d,$)=>d+$.iva,0),i=p.reduce((d,$)=>d+$.lineTotal,0),f=c>0?x(c):x(p.reduce((d,$)=>d+Number($.discount||0),0)),b=l;return I({id:t,date:new Date().toISOString(),paidAt:n==="credito"?null:new Date().toISOString(),paymentMethod:n==="credito"?"credito":s,documentType:b,notes:a,customer:o,items:p,subtotal:h,iva:y,total:i,discount:f,ticketDiscountPercent:Number(r||0)})}function Rt(t,e,o={}){const l=lt(t)?rt(t,e,o):pt(t,e,o);W(l,{format:e})}function pt(t,e,o={}){var C;const{showNotes:l=!0}=o,s=B(e),n=s.isTicket,a=s.print,r=s.productColPct,c=n?"100%":"210mm",p=n?a.fs:"14px",h=n?"0":"24px",y=n?"padding:2px 1px;word-wrap:break-word;overflow-wrap:break-word;white-space:normal;vertical-align:top;line-height:1.35;font-weight:600":"padding:2px 0;font-weight:600",i=n?`text-align:center;padding:2px 1px;vertical-align:top;font-size:${a.num}px;font-weight:700`:"text-align:center;padding:2px 4px;font-weight:700",f=n?`text-align:right;padding:2px 1px;vertical-align:top;font-size:${a.num}px;font-weight:700;word-wrap:break-word;overflow-wrap:break-word`:"text-align:right;padding:2px 0;font-weight:700",b=(u,N,M=!1)=>{const G=M?"font-weight:800;":"font-weight:700;",J=M?n?`font-size:${a.totalBold}px;`:"font-size:17px;":"";return`<div style="display:table;width:100%;${G}${J}">
      <span style="display:table-cell;padding:0 1px">${u}</span>
      <span style="display:table-cell;text-align:right;white-space:nowrap;padding:0 1px">${N}</span>
    </div>`},d=n?`<div style="margin-top:10px">
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${a.signature}px">Entrega</div>
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${a.signature}px">Recibe</div>
      </div>`:`<div style="display:flex;justify-content:space-between;gap:32px;margin-top:36px">
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Entrega</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Recibe</div>
        </div>
      </div>`,$=V(o.detailSettings??((C=L())==null?void 0:C.receiptDetailSettings)),R=t.documentType||"nota_venta",T=(t.items||[]).map((u,N)=>`<tr>
          <td style="${y}">${A(P(u,$,N,R))}</td>
          <td style="${i}">${u.quantity}</td>
          <td style="${f}">${ut(u.price)}</td>
          <td style="${f}">${D(u.lineTotal)}</td>
        </tr>`).join(""),w=(t.items||[]).reduce((u,N)=>u+Number(N.quantity||0),0);return`<div style="width:${c};max-width:${c};margin:0 auto;padding:${h};box-sizing:border-box;font-family:Arial,sans-serif;font-size:${p};font-weight:600;color:#000;line-height:1.35;overflow:hidden">
    <div style="text-align:center;margin-bottom:${n?6:16}px">
      <div style="font-weight:800;font-size:${n?a.title:22}px;color:#000">${A(t.businessName)}</div>
      ${t.businessDescription?`<div style="font-weight:800;font-size:${n?a.desc:13}px;color:#000;margin-top:2px">${A(t.businessDescription)}</div>`:""}
      <div style="font-weight:800;margin-top:${n?5:12}px;font-size:${n?a.docTitle:17}px;color:#000">${A(t.documentTitle)}</div>
      <div style="font-weight:800;font-size:${n?a.meta:13}px;color:#000;margin-top:2px">N° ${t.id||"—"}</div>
      <div style="font-weight:900;font-size:${n?a.date:18}px;color:#000;margin-top:3px">${A(t.date)}</div>
    </div>
    <div style="margin-bottom:${n?6:12}px;font-size:${n?a.customer:16}px;font-weight:700;color:#000;line-height:1.4">
      <div style="margin-bottom:${n?2:3}px"><strong>${z.name}</strong> ${A(t.customerName)}</div>
      ${t.customerCedula?`<div style="margin-bottom:${n?2:3}px"><strong>${z.cedula}</strong> ${A(t.customerCedula)}</div>`:""}
      ${t.customerPhone?`<div style="margin-bottom:${n?2:3}px"><strong>${z.phone}</strong> ${A(t.customerPhone)}</div>`:""}
      ${t.customerAddress?`<div style="margin-bottom:${n?2:3}px"><strong>${z.address}</strong> ${A(t.customerAddress)}</div>`:""}
      <div><strong>${z.payment}</strong> ${A(t.paymentMethod)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:${n?6:12}px;color:#000;table-layout:fixed">
      <thead>
        <tr style="border-bottom:1px solid #ccc">
          <th style="text-align:left;padding:2px 1px;font-weight:800;color:#000;width:${n?r.product:"auto"}">Producto</th>
          <th style="text-align:center;padding:2px 1px;font-weight:800;color:#000;width:${n?r.cant:"auto"}">Cant</th>
          <th style="text-align:right;padding:2px 1px;font-weight:800;color:#000;width:${n?r.pu:"auto"}">P.U.</th>
          <th style="text-align:right;padding:2px 1px;font-weight:800;color:#000;width:${n?r.total:"auto"}">Total</th>
        </tr>
      </thead>
      <tbody>${T}</tbody>
      <tfoot>
        <tr style="border-top:1px solid #ccc">
          <td style="text-align:right;padding:3px 1px;font-weight:800;color:#000">Total Cant</td>
          <td style="text-align:center;padding:3px 1px;font-weight:800;color:#000">${w}</td>
          <td style="padding:3px 1px"></td>
          <td style="padding:3px 1px"></td>
        </tr>
      </tfoot>
    </table>
    <div style="border-top:1px dashed #999;padding-top:${n?3:10}px;color:#000">
      ${b("Subtotal",D(t.subtotal))}
      ${t.iva>0?b("IVA",D(t.iva)):""}
      ${b("TOTAL",D(t.total),!0)}
    </div>
    ${l&&t.notes?`<div style="margin-top:${n?4:10}px;font-size:${n?a.notes:12}px;font-weight:700;color:#000;word-wrap:break-word">${A(t.notes)}</div>`:""}
    <div style="text-align:center;margin-top:${n?6:16}px;margin-bottom:0;font-size:${n?a.footer:12}px;font-weight:800;color:#000">Gracias por su compra</div>
    ${d}
  </div>`}function A(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}export{Nt as D,z as R,At as a,Ct as b,Rt as c,dt as d,vt as e,v as f,q as g,lt as h,yt as i,ut as j,D as k,$t as l,ht as m,I as n,wt as o,mt as p,O as q,Tt as r,it as s,ct as t};
