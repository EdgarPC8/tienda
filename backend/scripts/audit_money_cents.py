#!/usr/bin/env python3
"""
Auditoría de centavos: replica la lógica actual del sistema (Caja + SRI).

Caja (frontend CajaPage):
  total_línea = round2(qty * price)          # price CON IVA
  base        = round2(total / (1 + rate/100))
  iva         = round2(total - base)
  summary     = round2(sum bases), round2(sum ivas), round2(sum totales)

SRI (sriInvoiceEmitService + sriInvoiceXml):
  unitNeto = price / (1 + rate/100)          # SIN round por línea
  lineBase = qty * unitNeto                 # float
  lineTax  = lineBase * (rate/100)          # float
  subtotal/tax/total = sum float; al XML money()=toFixed(2)

Uso:
  python3 scripts/audit_money_cents.py
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, List, Sequence, Tuple


def round2_js(n: float) -> float:
    """Equivale a Number(Number(n).toFixed(2)) de JS (nearest, half-up tipico)."""
    return float(f"{float(n):.2f}")


def money_xml(n: float) -> float:
    """money() del XML SRI: n.toFixed(2)."""
    return float(f"{float(n):.2f}")


@dataclass
class Line:
    qty: float
    price: float  # CON IVA (como Caja / pedido POS)
    tax_rate: float = 15.0
    label: str = ""


@dataclass
class CaseResult:
    name: str
    caja_sub: float
    caja_iva: float
    caja_tot: float
    caja_sub_plus_iva: float
    caja_gap: float  # (sub+iva) - tot
    sri_sub_raw: float
    sri_tax_raw: float
    sri_tot_raw: float
    sri_sub_xml: float
    sri_tax_xml: float
    sri_tot_xml: float
    sri_xml_gap: float  # (sub_xml+tax_xml) - tot_xml  si se redondea cabecera
    sri_lines_sum_xml: float  # suma de (base_xml + tax_xml) por línea
    sri_lines_vs_tot_xml: float
    caja_vs_sri_tot: float  # caja_tot - sri_tot_xml


def caja_totals(lines: Sequence[Line]) -> Tuple[float, float, float, float]:
    sub = iva = tot = 0.0
    for ln in lines:
        if ln.tax_rate > 0:
            total = round2_js(ln.qty * ln.price)
            base = round2_js(total / (1 + ln.tax_rate / 100))
            tax = round2_js(total - base)
        else:
            total = round2_js(ln.qty * ln.price)
            base = total
            tax = 0.0
        sub += base
        iva += tax
        tot += total
    sub_r, iva_r, tot_r = round2_js(sub), round2_js(iva), round2_js(tot)
    return sub_r, iva_r, tot_r, round2_js(sub_r + iva_r)


def sri_totals(lines: Sequence[Line]) -> Tuple[float, float, float, float, float, float, float]:
    """Replica normalizeItems(pricesIncludeTax=True) + computeInvoiceTotals (corregido)."""
    sub = tax = 0.0
    sum_line_xml = 0.0
    for ln in lines:
        rate = ln.tax_rate
        if rate > 0:
            gross = round2_js(ln.qty * ln.price)
            line_base = round2_js(gross / (1 + rate / 100))
            line_tax = round2_js(gross - line_base)
        else:
            line_base = round2_js(ln.qty * ln.price)
            line_tax = 0.0
        sub = round2_js(sub + line_base)
        tax = round2_js(tax + line_tax)
        sum_line_xml = round2_js(sum_line_xml + line_base + line_tax)

    tot = round2_js(sub + tax)
    return sub, tax, tot, sub, tax, tot, sum_line_xml


def analyze(name: str, lines: Sequence[Line]) -> CaseResult:
    c_sub, c_iva, c_tot, c_sum = caja_totals(lines)
    s_sub, s_tax, s_tot, sx, tx, tox, lines_xml = sri_totals(lines)
    return CaseResult(
        name=name,
        caja_sub=c_sub,
        caja_iva=c_iva,
        caja_tot=c_tot,
        caja_sub_plus_iva=c_sum,
        caja_gap=round2_js(c_sum - c_tot),
        sri_sub_raw=s_sub,
        sri_tax_raw=s_tax,
        sri_tot_raw=s_tot,
        sri_sub_xml=sx,
        sri_tax_xml=tx,
        sri_tot_xml=tox,
        sri_xml_gap=round2_js(sx + tx - tox),
        sri_lines_sum_xml=lines_xml,
        sri_lines_vs_tot_xml=round2_js(lines_xml - tox),
        caja_vs_sri_tot=round2_js(c_tot - tox),
    )


def case_ok(r: CaseResult) -> bool:
    return (
        r.caja_gap == 0
        and r.sri_xml_gap == 0
        and r.sri_lines_vs_tot_xml == 0
        and r.caja_vs_sri_tot == 0
    )


def build_cases() -> List[Tuple[str, List[Line]]]:
    cases: List[Tuple[str, List[Line]]] = []

    # Casos reales-ish (Store)
    cases.append(("1 línea $1.00 IVA15 (como factura #1)", [Line(1, 1.00, 15)]))
    cases.append(("2 líneas $1+$1.50 IVA15 (factura #5)", [Line(1, 1.00, 15), Line(1, 1.50, 15)]))
    cases.append(("2 líneas $1+$12 (factura #4)", [Line(1, 1.00, 15), Line(1, 12.00, 15)]))
    cases.append(("sin IVA $40", [Line(1, 40.00, 0)]))

    # Estrés: muchas líneas chicas con IVA
    cases.append(
        (
            "10× $0.35 IVA15",
            [Line(1, 0.35, 15, f"p{i}") for i in range(10)],
        )
    )
    cases.append(
        (
            "20× $0.15 IVA15",
            [Line(1, 0.15, 15, f"p{i}") for i in range(20)],
        )
    )
    cases.append(
        (
            "7× $0.99 IVA15",
            [Line(1, 0.99, 15, f"p{i}") for i in range(7)],
        )
    )
    cases.append(
        (
            "mezcla montos raros IVA15",
            [
                Line(1, 0.10, 15),
                Line(1, 0.20, 15),
                Line(1, 0.30, 15),
                Line(1, 0.33, 15),
                Line(1, 0.67, 15),
                Line(1, 1.11, 15),
                Line(1, 2.22, 15),
                Line(3, 0.45, 15),
                Line(2, 1.15, 15),
            ],
        )
    )
    cases.append(
        (
            "qty fraccionaria 1.5×$1.15 IVA15",
            [Line(1.5, 1.15, 15)],
        )
    )
    cases.append(
        (
            "mix 15% + 0%",
            [Line(1, 1.00, 15), Line(1, 5.00, 0), Line(1, 2.50, 15), Line(1, 3.33, 0)],
        )
    )
    # Barrido sistemático: N líneas de $0.10
    for n in (3, 5, 8, 11, 15, 25):
        cases.append((f"{n}× $0.10 IVA15", [Line(1, 0.10, 15) for _ in range(n)]))

    # Precios unitarios que divididos por 1.15 dan muchos decimales
    for p in (0.05, 0.07, 0.11, 0.13, 0.17, 0.19, 0.23, 0.29, 1.15, 2.30, 3.45):
        cases.append((f"5× ${p:.2f} IVA15", [Line(1, p, 15) for _ in range(5)]))

    # Cantidades fraccionarias (donde más falla float SRI)
    for qty, price in (
        (1.5, 1.15),
        (1.5, 0.35),
        (2.5, 0.99),
        (0.5, 2.30),
        (1.25, 4.00),
        (3.33, 1.00),
    ):
        cases.append((f"qty={qty} × ${price:.2f} IVA15", [Line(qty, price, 15)]))

    return cases


def audit_payment_allocation() -> None:
    """Prorrateo de abono de grupo con residual en el último pedido."""
    print("=" * 72)
    print("PRORRATEO DE ABONOS (con residual en el último)")
    print("=" * 72)
    scenarios = [
        ("$30.01 en 3 pedidos iguales $10", 30.01, [10.0, 10.0, 10.0]),
        ("$10.00 en 3 pedidos $3.33/$3.33/$3.34", 10.00, [3.33, 3.33, 3.34]),
        ("$100.00 en 7 pedidos ~14.28", 100.00, [14.28, 14.28, 14.28, 14.28, 14.28, 14.28, 14.32]),
        ("$1.00 en 3 pedidos $0.40/$0.30/$0.30", 1.00, [0.40, 0.30, 0.30]),
    ]
    for name, paid, shares in scenarios:
        group_total = sum(shares)
        allocated = 0.0
        allocs = []
        for i, s in enumerate(shares):
            if i == len(shares) - 1:
                alloc = round2_js(paid - allocated)
            else:
                alloc = round2_js(paid * s / group_total)
                allocated = round2_js(allocated + alloc)
            allocs.append(alloc)
        ssum = round2_js(sum(allocs))
        gap = round2_js(ssum - paid)
        print(f"• {name}")
        print(f"  allocs={allocs} sum={ssum:.2f} paid={paid:.2f} gap={gap:+.2f}")
    print()


def sweep_integer_qty() -> None:
    """Barrido qty enteras 1..20 × precios 0.05..20.00 — resumen."""
    fails_hdr = fails_diff = 0
    for qty in range(1, 21):
        for cents in range(5, 2001):
            price = cents / 100.0
            caja = round2_js(qty * price)
            gross = round2_js(qty * price)
            base = round2_js(gross / 1.15)
            tax = round2_js(gross - base)
            tot = round2_js(base + tax)
            gap = round2_js(base + tax - tot)
            diff = round2_js(caja - tot)
            if gap:
                fails_hdr += 1
            if diff:
                fails_diff += 1
    print("=" * 72)
    print("BARRIDO qty ENTERA × precios $0.05..$20.00 IVA 15% (lógica corregida)")
    print("=" * 72)
    print(f"Combinaciones: {20 * (2001 - 5)}")
    print(f"Fallas cabecera SRI (sub+tax≠tot): {fails_hdr}")
    print(f"Fallas Caja≠SRI: {fails_diff}")
    print()


def main() -> None:
    cases = build_cases()
    results = [analyze(name, lines) for name, lines in cases]

    fails = [r for r in results if not case_ok(r)]
    caja_fails = [r for r in results if r.caja_gap != 0]
    sri_hdr_fails = [r for r in results if r.sri_xml_gap != 0]
    sri_line_fails = [r for r in results if r.sri_lines_vs_tot_xml != 0]
    caja_sri_fails = [r for r in results if r.caja_vs_sri_tot != 0]

    print("=" * 72)
    print("AUDITORÍA DE CENTAVOS (lógica actual Caja + SRI Store/EdDeli)")
    print("=" * 72)
    print(f"Casos probados: {len(results)}")
    print(f"Fallan algún chequeo: {len(fails)}")
    print(f"  · Caja sub+IVA ≠ total:           {len(caja_fails)}")
    print(f"  · SRI cabecera XML sub+tax ≠ tot: {len(sri_hdr_fails)}")
    print(f"  · SRI Σ líneas XML ≠ tot XML:     {len(sri_line_fails)}")
    print(f"  · Total Caja ≠ total SRI XML:     {len(caja_sri_fails)}")
    print()

    def show(title: str, rows: Iterable[CaseResult], limit: int = 25) -> None:
        rows = list(rows)
        print("-" * 72)
        print(f"{title} ({len(rows)})")
        print("-" * 72)
        if not rows:
            print("  (ninguno)")
            print()
            return
        for r in rows[:limit]:
            print(f"• {r.name}")
            print(
                f"  Caja: sub={r.caja_sub:.2f} iva={r.caja_iva:.2f} "
                f"sum={r.caja_sub_plus_iva:.2f} tot={r.caja_tot:.2f} gap={r.caja_gap:+.2f}"
            )
            print(
                f"  SRI XML: sub={r.sri_sub_xml:.2f} tax={r.sri_tax_xml:.2f} "
                f"sum={r.sri_sub_xml + r.sri_tax_xml:.2f} tot={r.sri_tot_xml:.2f} "
                f"gapHdr={r.sri_xml_gap:+.2f} | ΣlíneasXML={r.sri_lines_sum_xml:.2f} "
                f"gapLíneas={r.sri_lines_vs_tot_xml:+.2f}"
            )
            print(f"  Caja−SRI tot: {r.caja_vs_sri_tot:+.2f}")
        if len(rows) > limit:
            print(f"  … y {len(rows) - limit} más")
        print()

    show("FALLAS Caja (sub+IVA ≠ total cobrado)", caja_fails)
    show("FALLAS SRI cabecera (sub_xml+tax_xml ≠ tot_xml)", sri_hdr_fails)
    show("FALLAS SRI líneas (suma bases/taxes XML ≠ tot)", sri_line_fails)
    show("FALLAS Caja vs SRI (totales distintos)", caja_sri_fails)

    if caja_sri_fails:
        diffs = sorted({r.caja_vs_sri_tot for r in caja_sri_fails})
        print(f"Diferencias Caja−SRI observadas: {diffs}")
    if caja_fails:
        diffs = sorted({r.caja_gap for r in caja_fails})
        print(f"Gaps Caja observados: {diffs}")

    print()
    sweep_integer_qty()
    audit_payment_allocation()
    print("Leyenda: gap ≠ 0 → centavos que no cuadran con la lógica actual.")
    print("Script: AppsWeb/store/backend/scripts/audit_money_cents.py")


if __name__ == "__main__":
    main()
