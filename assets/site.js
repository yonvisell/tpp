const menu = document.querySelector('.menu-toggle');
menu?.addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  menu.setAttribute('aria-expanded', String(open));
});
document.querySelector('[data-print]')?.addEventListener('click', () => window.print());
const dialog = document.querySelector('.image-dialog');
const dialogImage = dialog?.querySelector('img');
const original = dialog?.querySelector('[data-original]');
const dialogTitle = dialog?.querySelector('[data-dialog-title]');
let opener;
document.querySelectorAll('[data-zoom]').forEach(link => {
  link.addEventListener('click', event => {
    if (!dialog?.showModal) return;
    event.preventDefault();
    opener = link;
    dialogImage.src = link.href;
    dialogImage.alt = link.querySelector('img')?.alt || 'Circuit image';
    dialogImage.classList.remove('full-size');
    dialogTitle.textContent = dialogImage.alt;
    original.href = link.href;
    dialog.showModal();
  });
});
dialog?.querySelector('.dialog-close')?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog?.addEventListener('close', () => opener?.focus());
dialogImage?.addEventListener('click', () => dialogImage.classList.toggle('full-size'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    document.body.classList.remove('nav-open');
    menu?.setAttribute('aria-expanded', 'false');
  }
});
const tocLinks = [...document.querySelectorAll('.toc a')];
if (tocLinks.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    entries.filter(entry => entry.isIntersecting).forEach(entry => {
      tocLinks.forEach(link => link.classList.toggle('active', link.hash === '#' + entry.target.id));
    });
  }, {rootMargin: '-5% 0px -75% 0px'});
  document.querySelectorAll('.article h2, .article h3').forEach(heading => observer.observe(heading));
}
