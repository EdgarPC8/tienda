import{G,z as j,H as J,I as M,F as W,J as Z,K as X}from"./index-DWxwZsyO.js";import{f as tt}from"./functions-D0i_CbNt.js";import{p as et}from"./printHtmlDocument-CYdWA1I-.js";import{c as ot}from"./code128Barcode-D2KDP90S.js";const U="[CAJA_POS]",nt="[CONTADO]",Q="[CREDITO]";function Ct({baseNote:t,saleType:e}){const o=e==="credito"?Q:nt,l=String(t||"").replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").replace(/\s+/g," ").trim();return`${U} ${o} ${l}`.trim()}function at(t){if(!t)return"—";const e=String(t.notes||""),o=t.customer,l=String((o==null?void 0:o.name)||"").trim();if(!e.includes(U))return l||"—";const s=e.toLowerCase();return s.includes("mostrador")||s.includes("consumidor final")||s.includes("sin datos de cliente")?"Consumidor Final":l||"—"}function it(t){const e=String((t==null?void 0:t.notes)||"");return!(!e.includes(U)||e.includes(Q)||String((t==null?void 0:t.paymentMethod)||"").toLowerCase()==="credito")}function Tt(t){return!it(t)}function Rt(t){return t.find(e=>{const o=String(e.name||"").toLowerCase();return o.includes("consumidor")||o.includes("final")})??null}const dt=t=>Number(Number(t||0).toFixed(2));function lt(t,e=9){const o=Math.max(0,Math.floor(Number(t)||0));return String(o).padStart(e,"0")}function rt(t,e,o){const l=String(t||"001").padStart(3,"0").slice(0,3),s=String(e||"001").padStart(3,"0").slice(0,3);return`${l}-${s}-${lt(o)}`}function E(t,e=2){return dt(t).toFixed(e)}function st(t){const e=Number(t||0);if(!Number.isFinite(e))return"0.00";const o=Number(e.toFixed(4));return Math.round(o*100)===o*100?o.toFixed(2):String(o)}function H(t,e=""){const o=t==null?"":String(t).trim();if(/^\d{40,}$/.test(o))return o;const l=e==null?"":String(e).trim();return/^\d{40,}$/.test(l)?l:o&&!/e[+-]?\d+$/i.test(o)?o:l||""}function ut(t){return String(t||"").toLowerCase()==="produccion"?"PRODUCCIÓN":"PRUEBAS"}function mt(t){const e=String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");return e.includes("efectivo")||e==="01"?"SIN UTILIZACION DEL SISTEMA FINANCIERO":e.includes("tarjeta")||e==="16"?"TARJETA DE CREDITO":e.includes("transfer")||e.includes("deposito")||e==="20"?"TRANSFERENCIA / DEPOSITO BANCARIO":(e.includes("credito"),"OTROS CON UTILIZACION DEL SISTEMA FINANCIERO")}function ct(t=[]){const e=(t||[]).map(n=>Number(n.taxRate||0)).filter(n=>n>0);if(!e.length)return 0;const o=new Map;e.forEach(n=>o.set(n,(o.get(n)||0)+1));let l=e[0],s=0;return o.forEach((n,a)=>{n>s&&(s=n,l=a)}),l}function wt(t,e,o=null,l={}){if(!t)return null;const s=(o==null?void 0:o.establishmentCode)||(e==null?void 0:e.establishmentCode)||"001",n=(o==null?void 0:o.emissionPointCode)||(e==null?void 0:e.emissionPointCode)||"001",a=(o==null?void 0:o.sequential)!=null?Number(o.sequential):null,r=H((o==null?void 0:o.accessKey)||(o==null?void 0:o.authorizationNumber)||""),u=H((o==null?void 0:o.authorizationNumber)||(o==null?void 0:o.accessKey)||r,r),p=(o==null?void 0:o.authorizedAt)||null;return{...t,logoUrl:l.logoUrl||t.logoUrl||"",fiscal:{ruc:(e==null?void 0:e.ruc)||"",legalName:(e==null?void 0:e.legalName)||t.businessName||"",tradeName:(e==null?void 0:e.tradeName)||t.businessDescription||"",matrixAddress:(e==null?void 0:e.matrixAddress)||"",establishmentAddress:(e==null?void 0:e.establishmentAddress)||(e==null?void 0:e.matrixAddress)||"",phone:(e==null?void 0:e.phone)||"",email:(e==null?void 0:e.email)||"",accountingRequired:!!(e!=null&&e.accountingRequired),environment:(e==null?void 0:e.environment)||(o==null?void 0:o.environment)||"pruebas",environmentLabel:ut((o==null?void 0:o.environment)||(e==null?void 0:e.environment)),establishmentCode:String(s).padStart(3,"0").slice(0,3),emissionPointCode:String(n).padStart(3,"0").slice(0,3),sequential:a,invoiceNumber:a!=null?rt(s,n,a):"",accessKey:r,authorizationNumber:u,authorizedAt:p,emissionDate:p&&String(p).slice(0,10)||t.dateIso&&String(t.dateIso).slice(0,10)||"",status:(o==null?void 0:o.status)||null,fromSettingsPreview:!(o!=null&&o.sequential)}}}function pt(t){return String((t==null?void 0:t.documentType)||"")==="factura"}function h(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function f(t,e,o=!1){return`<div style="margin:0 0 3px;line-height:1.3">
    <strong>${h(t)}</strong>
    <span style="font-weight:${o?800:600};word-break:break-all">${h(e||"—")}</span>
  </div>`}function V(t,{isTicket:e,ivaRate:o}){var p;const l=Number(t.discount||0),s=Number(t.ice||0),n=Number(t.tip||0),a=[["Total Sin Impuestos",E(t.subtotal)],["Descuento",E(l)],["Valor ICE",E(s)],[o>0?`Valor IVA ${o}%`:"Valor IVA",E(t.iva)]];e||a.push(["Propina",E(n)]),a.push(["Valor Total",E(t.total)]);const r=a.map(([y,$],i)=>`<div style="display:flex;justify-content:space-between;gap:8px;${i===a.length-1?"border-top:1px solid #000;margin-top:4px;padding-top:4px;font-weight:900":"font-weight:700"}">
        <span>${h(y)}</span><span>${h($)}</span>
      </div>`).join(""),u=(p=t.fiscal)!=null&&p.fromSettingsPreview?'<div style="margin-top:6px;font-size:10px;font-weight:700;color:#444">Sin factura SRI vinculada: el Nº se asigna al emitir/autorizar.</div>':"";return`${r}${u}`}function B(t,e){const o=mt(t.paymentMethod);return`<div style="font-size:0.9em">
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
          <td style="border:1px solid #000;padding:3px 4px;font-weight:600">${h(o)}</td>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:700">${h(E(t.total))}</td>
          <td style="border:1px solid #000;padding:3px 4px"></td>
          <td style="border:1px solid #000;padding:3px 4px;font-weight:600">ninguno</td>
        </tr>
      </tbody>
    </table>
  </div>`}function K(t,e,o){return`<div style="border:1px solid #000;padding:${o?6:8}px;margin-bottom:${o?8:10}px;line-height:1.35">
    ${f("Razón Social/ Nombres:",t.customerName)}
    ${o?`${f("Identificación:",t.customerCedula)}
           ${f("Dirección:",t.customerAddress)}
           ${f("Teléfono:",t.customerPhone)}
           ${f("Correo:",t.customerEmail)}`:`<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
            ${f("Identificación:",t.customerCedula)}
            ${f("Fecha Emisión:",e)}
            ${f("Dirección:",t.customerAddress)}
            ${f("Guía de Remisión:","")}
            ${f("Teléfono:",t.customerPhone)}
            ${f("Correo:",t.customerEmail)}
          </div>`}
  </div>`}function I(t,e,o){const l=t.logoUrl?`<img src="${h(t.logoUrl)}" alt="" style="max-width:${o?120:160}px;max-height:${o?70:90}px;object-fit:contain;margin:0 ${o?"auto":0} 6px;display:block" />`:"";return`<div style="text-align:${o?"center":"left"}">
    ${l}
    <div style="font-weight:900;font-size:${o?"0.95em":"1.05em"};line-height:1.25">${h(e.legalName||t.businessName)}</div>
    ${e.tradeName||t.businessDescription?`<div style="font-weight:700;font-size:${o?"0.85em":"0.95em"};margin-top:2px">${h(e.tradeName||t.businessDescription)}</div>`:""}
    ${e.matrixAddress?`<div style="font-weight:600;font-size:0.82em;margin-top:4px"><strong>Matriz: </strong>${h(e.matrixAddress)}</div>`:""}
    ${e.establishmentAddress?`<div style="font-weight:600;font-size:0.82em"><strong>Sucursal: </strong>${h(e.establishmentAddress)}</div>`:""}
    <div style="font-weight:600;font-size:0.82em;margin-top:3px"><strong>Obligado a llevar Contabilidad: </strong>${e.accountingRequired?"SI":"NO"}</div>
    ${e.phone?`<div style="font-weight:600;font-size:0.82em">${h(e.phone)}</div>`:""}
    ${e.email?`<div style="font-weight:600;font-size:0.82em">${h(e.email)}</div>`:""}
  </div>`}function ft(t,e="a4",o={}){var N,D;if(!t)return"";const l=W(e),s=l.isTicket,n=t.fiscal||{},a=t.items||[],r=G(o.detailSettings??((N=j())==null?void 0:N.receiptDetailSettings)),u=t.documentType||"factura",p=ct(a),y=n.emissionDate||t.date&&((D=String(t.date).match(/\d{4}-\d{2}-\d{2}/))==null?void 0:D[0])||"",$=n.authorizationNumber||n.accessKey||"",i=$?ot($,{height:s?36:52,maxWidth:s?240:420}):"",g="100%",x=s?l.narrow?"11px":"12.5px":"12pt",d="0",v=s?`<div style="text-align:center">
        <div style="font-weight:900;font-size:1.15em;letter-spacing:0.5px;margin-bottom:6px">FACTURA</div>
        ${f("Ruc:",n.ruc,!0)}
      </div>`:`<div>
        <div style="font-weight:900;font-size:1.35em;letter-spacing:0.5px;margin-bottom:8px;text-align:center">FACTURA</div>
        ${f("RUC:",n.ruc,!0)}
        ${f("No.",n.invoiceNumber,!0)}
        ${f("Ambiente",n.environmentLabel,!0)}
        ${f("Autorización",n.authorizationNumber||"Pendiente de autorización SRI")}
        ${n.authorizedAt?f("Fecha y Hora Autorización",n.authorizedAt):""}
        ${i?`<div style="margin-top:8px">${i}</div>`:""}
      </div>`,O=`<div style="text-align:center;margin-top:6px">
    ${f("Fecha Emisión:",y,!0)}
    ${f("No.",n.invoiceNumber,!0)}
    ${f("Ambiente",n.environmentLabel,!0)}
    ${f("Autorización",n.authorizationNumber||"Pendiente SRI")}
    ${n.authorizedAt?f("Fecha y Hora Autorización",n.authorizedAt):""}
    ${n.accessKey?f("Clave acceso",n.accessKey):""}
  </div>`,A=J(r,u,e),z={money:E,unitPrice:st,description:(c,w)=>Z(c,r,w,u)},R=A.map(c=>`${Math.max(.4,c.widthPct/12)}fr`).join(" "),m=s?`<div style="margin-bottom:8px">
        <div style="display:grid;grid-template-columns:${R};gap:2px;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:3px;font-weight:800;font-size:0.85em">
          ${A.map(c=>`<span style="text-align:${c.align}">${h(c.header)}</span>`).join("")}
        </div>
        ${a.map((c,w)=>`<div style="display:grid;grid-template-columns:${R};gap:2px;padding:3px 0;border-bottom:1px dotted #999;font-weight:600;font-size:0.9em;align-items:start">
              ${A.map(T=>{const F=h(M(T.id,c,w,z));return`<span style="${[`text-align:${T.align}`,T.breakWords?"word-break:break-word;overflow-wrap:anywhere":""].filter(Boolean).join(";")}">${F}</span>`}).join("")}
            </div>`).join("")}
      </div>`:`<table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:0.95em;table-layout:fixed">
        <colgroup>
          ${A.map(c=>`<col style="width:${c.width}" />`).join("")}
        </colgroup>
        <thead>
          <tr>
            ${A.map(c=>`<th style="border:1px solid #000;padding:5px 4px;font-weight:800;text-align:${c.align};background:#f3f3f3;overflow:hidden">${h(c.header)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${a.map((c,w)=>`<tr>
                ${A.map(T=>{const F=h(M(T.id,c,w,z)),S=T.id==="code"?"font-size:0.88em;word-break:break-all;overflow-wrap:anywhere;line-height:1.25":T.breakWords?"word-break:break-word;overflow-wrap:anywhere;line-height:1.3":"";return`<td style="border:1px solid #000;padding:3px 4px;font-weight:${T.align==="right"?700:600};text-align:${T.align};overflow:hidden;vertical-align:top;${S}">${F}</td>`}).join("")}
              </tr>`).join("")}
        </tbody>
      </table>`;return s?`<div style="width:${g};max-width:${g};margin:0 auto;padding:${d};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${x};color:#000;line-height:1.3">
      ${v}
      <div style="margin:8px 0">${I(t,n,!0)}</div>
      ${O}
      <div style="border-top:1px solid #000;border-bottom:1px solid #000;padding:4px 0;margin:8px 0"></div>
      ${K(t,y,!0)}
      ${m}
      ${V(t,{isTicket:!0,ivaRate:p})}
      <div style="margin-top:10px">${B(t,!0)}</div>
    </div>`:`<div style="width:${g};max-width:${g};margin:0 auto;padding:${d};box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;font-size:${x};color:#000;line-height:1.3">
    <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:10px;margin-bottom:10px">
      <div style="border:1px solid #000;padding:10px">${I(t,n,!1)}</div>
      <div style="border:1px solid #000;padding:10px">${v}</div>
    </div>
    ${K(t,y,!1)}
    ${m}
    <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:10px;align-items:start">
      <div style="border:1px solid #000;padding:8px">${B(t,!1)}</div>
      <div style="border:1px solid #000;padding:8px">${V(t,{isTicket:!1,ivaRate:p})}</div>
    </div>
  </div>`}const b=t=>Number(Number(t||0).toFixed(2)),_=t=>Number(Number(t||0).toFixed(3)),gt={factura:"Factura",nota_venta:"Nota de venta",documento:"Comprobante",consumidor_final:"Consumidor final"},zt=[{value:"factura",label:"Factura"},{value:"nota_venta",label:"Nota de venta"},{value:"documento",label:"Comprobante"},{value:"consumidor_final",label:"Consumidor final"}];function q(t){return gt[t]||t||"—"}function k(t){switch(t){case"factura":return"FACTURA";case"nota_venta":return"NOTA DE VENTA";case"consumidor_final":return"CONSUMIDOR FINAL";default:return"COMPROBANTE DE VENTA"}}function Et(t,e){if(!t)return null;const o=e||t.documentType||"documento",l=t._customerRaw||{};if(o==="consumidor_final")return{...t,documentType:o,documentTypeLabel:q(o),documentTitle:k(o),customerName:"Consumidor Final",customerPhone:"",customerAddress:"",customerEmail:"",customerCedula:""};const s=String(l.name||"").trim()||(t.customerName&&t.customerName!=="Consumidor Final"?t.customerName:"")||"—";return{...t,documentType:o,documentTypeLabel:q(o),documentTitle:k(o),customerName:s,customerPhone:l.phone||t.customerPhone||"",customerAddress:l.address||t.customerAddress||"",customerEmail:l.email||t.customerEmail||"",customerCedula:l.cedula||t.customerCedula||""}}function Dt(t,e){return t==="factura"?"factura":t==="nota_venta"?"nota_venta":e?"documento":"consumidor_final"}function L(t){return`$${b(t).toFixed(2)}`}function bt(t){const e=_(t),o=Math.round(e*100)===e*100?2:3;return`$${e.toFixed(o)}`}function xt(t){return tt(t)}const P={name:"Nom:",cedula:"CI:",phone:"Tel:",address:"Dir:",payment:"Pag:"};function yt(t){const e=String(t||"").toLowerCase();return e==="efectivo"?"Efectivo":e==="transferencia"?"Transferencia":e==="tarjeta"?"Tarjeta":e==="credito"?"Crédito":t||"—"}function Y(t){if(!t)return null;const e=(t.items||[]).map(i=>({name:i.name||i.productName||"Producto",code:i.code||i.sku||i.barcode||"",barcode:i.barcode||i.code||i.sku||"",unitLabel:i.unitLabel||i.unit||"",productId:i.productId||i.id||null,quantity:Number(i.quantity||0),price:_(i.price),discount:b(i.discount||0),lineTotal:b(i.lineTotal??Number(i.quantity)*Number(i.price)),taxRate:Number(i.taxRate||0),subtotal:b(i.subtotal??i.lineTotal),iva:b(i.iva||0)})),o=b(t.subtotal??e.reduce((i,g)=>i+g.subtotal,0)),l=b(t.iva??e.reduce((i,g)=>i+g.iva,0)),s=b(t.total??e.reduce((i,g)=>i+g.lineTotal,0)),n=b(t.discount??e.reduce((i,g)=>i+Number(g.discount||0),0)),a=t.customer||{},r=t.documentType||"documento",u=at({notes:t.notes||"",customer:a}),p=String(a.name||"").trim()||(u&&u!=="Consumidor Final"?u:""),y=r==="consumidor_final"?"Consumidor Final":p||u||a.name||"—",$=j();return{id:t.id,businessName:$.alias||"App",businessDescription:$.description||"",logoUrl:$.logoUrl||"",documentTitle:k(r),documentType:r,documentTypeLabel:q(r),date:xt(t.date||t.paidAt),dateIso:t.date||t.paidAt||null,customerName:y,customerPhone:a.phone||"",customerAddress:a.address||"",customerEmail:a.email||"",customerCedula:a.cedula||"",_customerRaw:{name:p,phone:a.phone||"",address:a.address||"",email:a.email||"",cedula:a.cedula||""},paymentMethod:yt(t.paymentMethod),items:e,subtotal:o,iva:l,total:s,discount:n,ticketDiscountPercent:Number(t.ticketDiscountPercent||0),notes:String(t.notes||"").replace(/\[CAJA_POS\]/g,"").replace(/\[CONTADO\]/g,"").replace(/\[CREDITO\]/g,"").trim()}}function Ot(t){if(!t)return null;const o=(t.ERP_order_items||t.items||[]).map(r=>{var d;const u=Number(r.quantity||0),p=_(r.price),y=b(u*p),$=Number(((d=r.ERP_inventory_product)==null?void 0:d.taxRate)||r.taxRate||0);let i=y,g=0;$>0&&(i=b(y/(1+$/100)),g=b(y-i));const x=r.ERP_inventory_product||{};return{name:x.name||r.name||"Producto",code:x.sku||x.barcode||r.code||"",barcode:x.barcode||x.sku||r.code||"",unitLabel:x.unitLabel||x.unit||r.unitLabel||"",productId:r.productId||x.id||null,quantity:u,price:p,discount:0,taxRate:$,subtotal:i,iva:g,lineTotal:y}}),l=o.reduce((r,u)=>r+u.subtotal,0),s=o.reduce((r,u)=>r+u.iva,0),n=o.reduce((r,u)=>r+u.lineTotal,0),a=t.ERP_customer||t.customer||{};return Y({id:t.id,date:t.date,paidAt:t.paidAt,paymentMethod:t.paymentMethod||"credito",documentType:t.documentType||"nota_venta",notes:t.notes,customer:a,items:o,subtotal:l,iva:s,total:n})}function Pt({orderId:t,cart:e,customer:o,documentType:l,paymentMethod:s,saleType:n,notes:a,ticketDiscountPercent:r=0,discountTotal:u=0}){const p=e.map(d=>{const v=Number(d.quantity||0),O=_(d.price),A=d.lineTotal!=null&&Number.isFinite(Number(d.lineTotal))?b(d.lineTotal):b(v*O),z=Number(d.taxRate||0);let R=d.subtotal!=null&&Number.isFinite(Number(d.subtotal))?b(d.subtotal):A,m=d.iva!=null&&Number.isFinite(Number(d.iva))?b(d.iva):0;return d.subtotal==null&&z>0&&(R=b(A/(1+z/100)),m=b(A-R)),{name:d.name,code:d.sku||d.barcode||d.code||"",barcode:d.barcode||d.sku||d.code||"",unitLabel:d.unitLabel||d.unit||"",productId:d.productId||d.id||null,quantity:v,price:O,discount:b(d.discount||0),discountPercent:Number(d.discountPercent||0),taxRate:z,subtotal:R,iva:m,lineTotal:A}}),y=p.reduce((d,v)=>d+v.subtotal,0),$=p.reduce((d,v)=>d+v.iva,0),i=p.reduce((d,v)=>d+v.lineTotal,0),g=u>0?b(u):b(p.reduce((d,v)=>d+Number(v.discount||0),0)),x=l;return Y({id:t,date:new Date().toISOString(),paidAt:n==="credito"?null:new Date().toISOString(),paymentMethod:n==="credito"?"credito":s,documentType:x,notes:a,customer:o,items:p,subtotal:y,iva:$,total:i,discount:g,ticketDiscountPercent:Number(r||0)})}function Ft(t,e,o={}){const l=pt(t)?ft(t,e,o):ht(t,e,o);et(l,{format:e})}function ht(t,e,o={}){var R;const{showNotes:l=!0}=o,s=W(e),n=s.isTicket,a=s.print,r=n?"100%":"210mm",u=n?a.fs:"14px",p=n?"0":"24px",y=(m,N,D=!1)=>{const c=D?"font-weight:800;":"font-weight:700;",w=D?n?`font-size:${a.totalBold}px;`:"font-size:17px;":"";return`<div style="display:table;width:100%;${c}${w}">
      <span style="display:table-cell;padding:0 1px">${m}</span>
      <span style="display:table-cell;text-align:right;white-space:nowrap;padding:0 1px">${N}</span>
    </div>`},$=n?`<div style="margin-top:10px">
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${a.signature}px">Entrega</div>
        <div style="border-top:1.5px solid #000;margin-top:28px;padding-top:5px;text-align:center;font-weight:800;font-size:${a.signature}px">Recibe</div>
      </div>`:`<div style="display:flex;justify-content:space-between;gap:32px;margin-top:36px">
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Entrega</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="border-top:1.5px solid #000;margin-top:40px;padding-top:6px;font-weight:800;font-size:14px">Recibe</div>
        </div>
      </div>`,i=G(o.detailSettings??((R=j())==null?void 0:R.receiptDetailSettings)),g=t.documentType||"nota_venta",x=J(i,g,e),d={money:L,unitPrice:bt,description:(m,N)=>Z(m,i,N,g)},v=x.findIndex(m=>m.id==="qty"),O=(t.items||[]).map((m,N)=>`<tr>${x.map(c=>{const w=C(M(c.id,m,N,d));return`<td style="${[`text-align:${c.id==="qty"?"center":c.align==="right"?"right":"left"}`,"padding:2px 1px","vertical-align:top",`font-weight:${c.align==="right"||c.id==="qty"?700:600}`,c.breakWords?"word-wrap:break-word;overflow-wrap:anywhere;white-space:normal":"white-space:nowrap",n&&c.align==="right"?`font-size:${a.num}px`:""].filter(Boolean).join(";")}">${w}</td>`}).join("")}</tr>`).join(""),A=(t.items||[]).reduce((m,N)=>m+Number(N.quantity||0),0),z=x.map((m,N)=>m.id==="qty"?`<td style="text-align:center;padding:3px 1px;font-weight:800;color:#000">${C(X(A))}</td>`:(v>0?N===v-1:N===0&&m.id==="description")?'<td style="text-align:right;padding:3px 1px;font-weight:800;color:#000">Total Cant</td>':'<td style="padding:3px 1px"></td>').join("");return`<div style="width:${r};max-width:${r};margin:0 auto;padding:${p};box-sizing:border-box;font-family:Arial,sans-serif;font-size:${u};font-weight:600;color:#000;line-height:1.35;overflow:hidden">
    <div style="text-align:center;margin-bottom:${n?6:16}px">
      <div style="font-weight:800;font-size:${n?a.title:22}px;color:#000">${C(t.businessName)}</div>
      ${t.businessDescription?`<div style="font-weight:800;font-size:${n?a.desc:13}px;color:#000;margin-top:2px">${C(t.businessDescription)}</div>`:""}
      <div style="font-weight:800;margin-top:${n?5:12}px;font-size:${n?a.docTitle:17}px;color:#000">${C(t.documentTitle)}</div>
      <div style="font-weight:800;font-size:${n?a.meta:13}px;color:#000;margin-top:2px">N° ${t.id||"—"}</div>
      <div style="font-weight:900;font-size:${n?a.date:18}px;color:#000;margin-top:3px">${C(t.date)}</div>
    </div>
    <div style="margin-bottom:${n?6:12}px;font-size:${n?a.customer:16}px;font-weight:700;color:#000;line-height:1.4">
      <div style="margin-bottom:${n?2:3}px"><strong>${P.name}</strong> ${C(t.customerName)}</div>
      ${t.customerCedula?`<div style="margin-bottom:${n?2:3}px"><strong>${P.cedula}</strong> ${C(t.customerCedula)}</div>`:""}
      ${t.customerPhone?`<div style="margin-bottom:${n?2:3}px"><strong>${P.phone}</strong> ${C(t.customerPhone)}</div>`:""}
      ${t.customerAddress?`<div style="margin-bottom:${n?2:3}px"><strong>${P.address}</strong> ${C(t.customerAddress)}</div>`:""}
      <div><strong>${P.payment}</strong> ${C(t.paymentMethod)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:${n?6:12}px;color:#000;table-layout:fixed">
      <colgroup>
        ${x.map(m=>`<col style="width:${m.width}" />`).join("")}
      </colgroup>
      <thead>
        <tr style="border-bottom:1px solid #ccc">
          ${x.map(m=>`<th style="text-align:${m.id==="qty"?"center":m.align==="right"?"right":"left"};padding:2px 1px;font-weight:800;color:#000;width:${m.width}">${C(m.header)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${O}</tbody>
      <tfoot>
        <tr style="border-top:1px solid #ccc">${z}</tr>
      </tfoot>
    </table>
    <div style="border-top:1px dashed #999;padding-top:${n?3:10}px;color:#000">
      ${y("Subtotal",L(t.subtotal))}
      ${t.iva>0?y("IVA",L(t.iva)):""}
      ${y("TOTAL",L(t.total),!0)}
    </div>
    ${l&&t.notes?`<div style="margin-top:${n?4:10}px;font-size:${n?a.notes:12}px;font-weight:700;color:#000;word-wrap:break-word">${C(t.notes)}</div>`:""}
    <div style="text-align:center;margin-top:${n?6:16}px;margin-bottom:0;font-size:${n?a.footer:12}px;font-weight:800;color:#000">Gracias por su compra</div>
    ${$}
  </div>`}function C(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}export{zt as D,P as R,Et as a,Ot as b,Ft as c,ct as d,wt as e,E as f,st as g,pt as h,Tt as i,L as j,bt as k,Rt as l,Ct as m,Y as n,Pt as o,yt as p,q,Dt as r,mt as s,xt as t};
