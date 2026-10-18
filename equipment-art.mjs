const paths = {
  boots: '<path d="M15 18h22v28l17 9v12H10V49l5-5zM53 18h20v27l15 10v12H51V49l2-4z" fill="#ac794d"/><path d="M10 65h44M51 65h37" stroke="#e8d4a0" stroke-width="5"/>',
  backpack: '<path d="M37 18v-7h26v7M23 33l-9 7v32M77 33l9 7v32" fill="none" stroke="#d1bd89" stroke-width="6"/><rect x="24" y="18" width="52" height="62" rx="13" fill="#638578"/><rect x="33" y="46" width="34" height="25" rx="5" fill="#395a51"/><path d="M27 35h46M47 30v12h7V30" stroke="#e5cc8d" stroke-width="4"/>',
  raincoat: '<path d="M35 23q15-26 30 0l21 17-12 15-9-8 7 34H28l7-34-9 8-12-15z" fill="#e2bb56"/><path d="M50 26v54M38 19q12 12 24 0M34 57h10M57 57h10" fill="none" stroke="#896a33" stroke-width="3"/>',
  sleepingBag: '<rect x="29" y="8" width="42" height="76" rx="19" fill="#ad6955"/><ellipse cx="50" cy="25" rx="13" ry="10" fill="#e7ca9a"/><path d="M35 44h30M34 57h32M37 70h26M63 36v37" stroke="#724c43" stroke-width="3"/>',
  tent: '<path d="M9 77L49 16l43 61z" fill="#bc9457"/><path d="M49 16l8 61H19z" fill="#d9b56c"/><path d="M49 33l-1 44H27z" fill="#344b48"/><path d="M4 79h92M49 16V9" stroke="#eee0b4" stroke-width="3"/>',
  camera: '<path d="M29 31l7-11h28l7 11" fill="#b6b8a9"/><rect x="12" y="31" width="76" height="46" rx="8" fill="#526563"/><circle cx="50" cy="54" r="20" fill="#c1c5af"/><circle cx="50" cy="54" r="14" fill="#263e48"/><circle cx="46" cy="50" r="5" fill="#8eb4bd"/><rect x="72" y="38" width="10" height="7" fill="#edd9a8"/>',
};

export function itemArt(doc, id) {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 100 90");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = paths[id] ?? '<path d="M50 9l28 36-28 36-28-36z" fill="#c6a75e"/><circle cx="50" cy="45" r="12" fill="#436563"/>';
  return svg;
}
