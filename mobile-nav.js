// Maneja el menú ☰ (sidebar), el botón flotante de notas, y el fondo
// oscuro detrás de los cajones, solo relevante en pantallas chicas.
(function () {
  const overlay = document.getElementById('mobile-overlay');
  const sidebar = document.querySelector('.sidebar');
  const notesPanel = document.getElementById('notes-panel');
  const btnMenu = document.getElementById('btn-mobile-menu');
  const btnNotes = document.getElementById('btn-mobile-notes');

  function closeAll() {
    sidebar && sidebar.classList.remove('mobile-open');
    notesPanel && notesPanel.classList.remove('mobile-open');
    overlay && overlay.classList.remove('mobile-open');
  }

  btnMenu && btnMenu.addEventListener('click', () => {
    const willOpen = !sidebar.classList.contains('mobile-open');
    closeAll();
    if (willOpen) {
      sidebar.classList.add('mobile-open');
      overlay.classList.add('mobile-open');
    }
  });

  btnNotes && btnNotes.addEventListener('click', () => {
    const willOpen = !notesPanel.classList.contains('mobile-open');
    closeAll();
    if (willOpen) {
      notesPanel.classList.add('mobile-open');
      overlay.classList.add('mobile-open');
    }
  });

  overlay && overlay.addEventListener('click', closeAll);

  // Si tocás un día del calendario en el celu, te conviene que se
  // abra directo el panel de notas de ese día.
  document.addEventListener('click', (e) => {
    if (window.innerWidth > 900) return;
    const dayCell = e.target.closest('.day-cell, .cal-day');
    if (dayCell) setTimeout(() => {
      notesPanel.classList.add('mobile-open');
      overlay.classList.add('mobile-open');
    }, 80);
  });
})();
