const links = [...document.querySelectorAll(".toc a[href^='#']")];
const targets = links.map(link => document.getElementById(link.hash.slice(1)));
let active;
let scheduled = false;

function update() {
  scheduled = false;
  let index = 0;
  targets.forEach((target, i) => {
    if (target && !target.hidden && target.getBoundingClientRect().top <= 100) index = i;
  });
  if (window.scrollY + innerHeight >= document.documentElement.scrollHeight - 2)
    index = links.length - 1;
  const link = links[index];
  if (!link || active === link) return;
  active?.removeAttribute("aria-current");
  link.setAttribute("aria-current", "location");
  active = link;
}

window.addEventListener("scroll", () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(update);
}, { passive: true });
update();
