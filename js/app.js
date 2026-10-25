/**
 * Personal Trip Planner SPA - Core Application Logic
 * Vanilla JavaScript (ES6+) with Promise.all() Concurrent Data Loading,
 * LocalStorage Persistence & Light/Dark Theme Switcher.
 */

(function () {
  'use strict';

  // State Management
  const state = {
    itinerary: [],
    restaurants: [],
    activeSection: 'home-section',
    restaurantView: 'grid', // 'grid' | 'list'
    activeLocation: 'ALL', // 'ALL' | 'HIGHLIGHT' | place name
    activeItineraryFilter: 'ALL', // 'ALL' | full date string (within activeLocation)
    activeRestaurantFilter: 'Highlights',
    searchQuery: '',
    targetDepartureDate: null
  };

  // Curated itinerary highlights shown via the "Highlights" filter chip (matched by Image path)
  const HIGHLIGHT_ITINERARY_IMAGES = new Set([
    'images/restaurants/tsim-sha-tsui-street-food.jpg',
    'images/itinerary/avenue-of-stars.jpg',
    'images/itinerary/mocape-shenzhen.jpg',
    'images/restaurants/long-time-ago-mutton-shashlik.jpg',
    'images/itinerary/civic-center-lightshow.jpg',
    'images/itinerary/hong-kong-temples.jpg',
    'images/itinerary/peak-tram.jpg',
    'images/itinerary/sky-terrace-428.jpg'
  ]);

  // DOM Elements Cache
  const elements = {
    heroSubtitle: document.getElementById('heroSubtitle'),
    heroTitleMain: document.getElementById('heroTitleMain'),
    heroTitleHighlight: document.getElementById('heroTitleHighlight'),
    pillDatesText: document.getElementById('pillDatesText'),
    pillHotelText: document.getElementById('pillHotelText'),
    cdDays: document.getElementById('cd-days'),
    cdHours: document.getElementById('cd-hours'),
    cdMinutes: document.getElementById('cd-minutes'),
    cdSeconds: document.getElementById('cd-seconds'),
    navTabs: document.querySelectorAll('.nav-tab-btn'),
    sections: document.querySelectorAll('.content-section'),
    searchInput: document.getElementById('searchInput'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    filterBar: document.getElementById('filterBar'),
    itineraryContainer: document.getElementById('itinerary-timeline-wrapper'),
    restaurantsGrid: document.getElementById('restaurants-grid-wrapper'),
    gridViewBtn: document.getElementById('gridViewBtn'),
    listViewBtn: document.getElementById('listViewBtn'),
    highlightsBadgeCount: document.getElementById('highlights-badge-count'),
    homeIntroText: document.getElementById('homeIntroText'),
    homeStatsWrapper: document.getElementById('home-stats-wrapper'),
    homeHighlightsWrapper: document.getElementById('home-highlights-wrapper'),
    homeDiningWrapper: document.getElementById('home-dining-wrapper')
  };

  /* ==========================================================================
     1. INITIALIZATION & DATA FETCHING
     ========================================================================== */

  document.addEventListener('DOMContentLoaded', initApp);

  async function initApp() {
    initTheme();
    setupEventListeners();
    await loadTripInfo();
    startCountdown();
    fetchAppData();
    registerServiceWorker();
  }

  /**
   * Fetch trip-info.json and populate hero header (title, subtitle, dates, hotel, departure date)
   */
  async function loadTripInfo() {
    try {
      const res = await fetch('data/trip-info.json');
      if (!res.ok) throw new Error('Failed to load trip-info.json');
      const info = await res.json();

      if (elements.heroSubtitle) elements.heroSubtitle.textContent = info.subtitle;
      if (elements.heroTitleMain) elements.heroTitleMain.textContent = info.titleMain;
      if (elements.heroTitleHighlight) elements.heroTitleHighlight.textContent = info.titleHighlight;
      if (elements.pillDatesText) elements.pillDatesText.textContent = info.dateRangeDisplay;
      if (elements.pillHotelText) elements.pillHotelText.textContent = info.hotelName;

      state.homeDescription = info.description || '';
      state.targetDepartureDate = new Date(info.departureDate);
    } catch (error) {
      console.error('Error loading trip info:', error);
      state.targetDepartureDate = new Date(); // Fallback: countdown shows 00:00:00:00
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    }
  }

  /* ==========================================================================
     2. THEME SWITCHER & LOCALSTORAGE PERSISTENCE
     ========================================================================== */

  function initTheme() {
    const savedTheme = localStorage.getItem('user-theme');
    let theme = 'dark'; // Default fallback

    if (savedTheme === 'light' || savedTheme === 'dark') {
      theme = savedTheme;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      theme = 'light';
    }

    setTheme(theme);

    // Listen for system color scheme changes if user hasn't set an explicit preference
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem('user-theme')) {
          setTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('user-theme', newTheme);
  }

  /**
   * Helper function to fetch and parse CSV file asynchronously using PapaParse
   * @param {string} url - The relative or absolute path to the CSV file
   * @returns {Promise<Array<Object>>} Parsed CSV rows as JavaScript objects
   */
  async function fetchAndParseCSV(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV file from ${url}: ${response.statusText}`);
    }
    const csvText = await response.text();
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors && results.errors.length > 0) {
            console.warn(`PapaParse warnings for ${url}:`, results.errors);
          }
          resolve(results.data);
        },
        error: (err) => reject(err)
      });
    });
  }

  /**
   * Fetch itinerary.csv and restaurants.csv concurrently using Promise.all()
   */
  async function fetchAppData() {
    try {
      showLoadingState();

      const [itineraryData, restaurantsData] = await Promise.all([
        fetchAndParseCSV('data/itinerary.csv'),
        fetchAndParseCSV('data/restaurants.csv')
      ]);

      state.itinerary = itineraryData;
      state.restaurants = restaurantsData;

      // Update Highlights Count Badge
      if (elements.highlightsBadgeCount && state.itinerary.length) {
        elements.highlightsBadgeCount.textContent = `${state.itinerary.length} Activities • ${state.restaurants.length} Dining Spots`;
      }

      // Render App Components
      renderFilterBar();
      renderItinerary();
      renderRestaurants();
      renderHome();

      // Home is the default landing tab — it has no day/type filters
      elements.filterBar.style.display = 'none';

    } catch (error) {
      console.error('Error fetching trip data:', error);
      showErrorState(error.message);
    }
  }

  /**
   * Render the Home overview tab: trip description, quick stats, and highlight
   * cards pulled from the itinerary and restaurants data already in state.
   */
  function renderHome() {
    if (elements.homeIntroText) {
      elements.homeIntroText.textContent = state.homeDescription || '';
    }

    const dayCount = new Set(state.itinerary.map(item => (item.Date || '').trim()).filter(Boolean)).size;

    if (elements.homeStatsWrapper) {
      elements.homeStatsWrapper.innerHTML = `
        <div class="budget-summary-card card-thb">
          <div class="summary-top"><span class="summary-label">Trip Days</span></div>
          <div class="summary-amount">${dayCount}</div>
        </div>
        <div class="budget-summary-card card-cny">
          <div class="summary-top"><span class="summary-label">Activities</span></div>
          <div class="summary-amount">${state.itinerary.length}</div>
        </div>
        <div class="budget-summary-card card-thb">
          <div class="summary-top"><span class="summary-label">Dining Spots</span></div>
          <div class="summary-amount">${state.restaurants.length}</div>
        </div>
      `;
    }

    if (elements.homeHighlightsWrapper) {
      const highlightStops = state.itinerary.filter(item => item.Image && item.Image.trim() !== '');
      if (highlightStops.length > 0) {
        elements.homeHighlightsWrapper.innerHTML = highlightStops.map(item => `
          <div class="restaurant-card has-image home-nav-card" data-nav="itinerary-section">
            <div class="restaurant-img-wrapper">
              <img src="${escapeHTML(item.Image.trim())}" alt="${escapeHTML(item.Topic || item.Detail || '')}" class="restaurant-img" loading="lazy">
              <span class="type-badge">${escapeHTML((item.Date || '').trim())}</span>
            </div>
            <div class="restaurant-info">
              <div class="restaurant-content-top">
                <h3 class="restaurant-name">${escapeHTML(item.Topic || item.Detail || '')}</h3>
              </div>
            </div>
          </div>
        `).join('');
      } else {
        // Fallback: Pick key iconic activities across destinations for preview
        const keyStops = state.itinerary.filter(item => 
          item.Topic && 
          !item.Topic.startsWith('Transfer') && 
          !item.Topic.startsWith('Drive') && 
          !item.Topic.startsWith('Return') && 
          !item.Topic.startsWith('Check-Out') && 
          !item.Topic.startsWith('Early Check-in') && 
          !item.Topic.startsWith('Flight')
        ).slice(0, 8);
        elements.homeHighlightsWrapper.innerHTML = keyStops.map(item => `
          <div class="restaurant-card no-image home-nav-card" data-nav="itinerary-section" style="cursor: pointer;">
            <div class="restaurant-info">
              <div class="restaurant-content-top">
                <span class="type-badge" style="margin-bottom: 0.5rem; display: inline-block;">${escapeHTML((item.Date || '').split('-')[0].trim())}</span>
                <h3 class="restaurant-name">${escapeHTML(item.Topic || item.Detail || '')}</h3>
                ${item.Detail && item.Detail !== item.Topic ? `<p class="restaurant-address" style="margin-top: 0.4rem; color: var(--text-muted); font-size: 0.85rem;">${escapeHTML(item.Detail)}</p>` : ''}
                ${item.Time && item.Time !== '-' ? `<p class="restaurant-hours" style="margin-top: 0.5rem; font-size: 0.82rem;">⏱️ ${escapeHTML(item.Time)}</p>` : ''}
              </div>
            </div>
          </div>
        `).join('');
      }
    }

    if (elements.homeDiningWrapper) {
      const highlightDining = state.restaurants.filter(item => (item.Type || '').toLowerCase().includes('highlight'));
      elements.homeDiningWrapper.innerHTML = highlightDining.map(item => `
        <div class="restaurant-card has-image home-nav-card" data-nav="restaurants-section">
          <div class="restaurant-img-wrapper">
            <img src="${escapeHTML(item.Image.trim())}" alt="${escapeHTML(item.List)}" class="restaurant-img" loading="lazy">
            ${item.Price ? `<span class="price-badge">${escapeHTML(item.Price)}</span>` : ''}
          </div>
          <div class="restaurant-info">
            <div class="restaurant-content-top">
              <h3 class="restaurant-name">${escapeHTML(item.List)}</h3>
            </div>
          </div>
        </div>
      `).join('');
    }

    // Clicking a Home highlight card jumps straight to its tab
    document.querySelectorAll('#home-highlights-wrapper .home-nav-card, #home-dining-wrapper .home-nav-card').forEach(card => {
      card.addEventListener('click', () => {
        switchSection(card.getAttribute('data-nav'));
      });
    });
  }

  /* ==========================================================================
     3. COUNTDOWN TIMER LOGIC
     ========================================================================== */

  function startCountdown() {
    function updateTimer() {
      const now = new Date().getTime();
      const distance = state.targetDepartureDate.getTime() - now;

      if (distance < 0) {
        elements.cdDays.textContent = '00';
        elements.cdHours.textContent = '00';
        elements.cdMinutes.textContent = '00';
        elements.cdSeconds.textContent = '00';
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      elements.cdDays.textContent = padZero(days);
      elements.cdHours.textContent = padZero(hours);
      elements.cdMinutes.textContent = padZero(minutes);
      elements.cdSeconds.textContent = padZero(seconds);
    }

    updateTimer();
    setInterval(updateTimer, 1000);
  }

  function padZero(num) {
    return num < 10 ? `0${num}` : num;
  }

  /* ==========================================================================
     4. EVENT HANDLERS & NAVIGATION TABS
     ========================================================================== */

  function setupEventListeners() {
    // Theme Toggle Button
    if (elements.themeToggleBtn) {
      elements.themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Navigation Tabs
    elements.navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-target');
        switchSection(targetId);
      });
    });

    // View Switcher for Restaurants
    elements.gridViewBtn.addEventListener('click', () => {
      state.restaurantView = 'grid';
      elements.gridViewBtn.classList.add('active');
      elements.listViewBtn.classList.remove('active');
      elements.restaurantsGrid.classList.remove('list-view');
    });

    elements.listViewBtn.addEventListener('click', () => {
      state.restaurantView = 'list';
      elements.listViewBtn.classList.add('active');
      elements.gridViewBtn.classList.remove('active');
      elements.restaurantsGrid.classList.add('list-view');
    });

    // Real-time Search Input (debounced to avoid re-rendering on every keystroke)
    let searchDebounceTimer = null;
    elements.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      const value = e.target.value;
      searchDebounceTimer = setTimeout(() => {
        state.searchQuery = value.toLowerCase().trim();
        renderItinerary();
        renderRestaurants();
      }, 200);
    });
  }

  function switchSection(targetId) {
    state.activeSection = targetId;

    elements.navTabs.forEach(tab => {
      const isActive = tab.getAttribute('data-target') === targetId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    elements.sections.forEach(sec => {
      if (sec.id === targetId) {
        sec.style.display = 'block';
      } else {
        sec.style.display = 'none';
      }
    });

    // Toggle filter bar visibility based on section
    if (targetId === 'home-section') {
      elements.filterBar.style.display = 'none';
    } else {
      elements.filterBar.style.display = 'flex';
      renderFilterBar();
    }
  }

  /* ==========================================================================
     5. FILTER BAR RENDERER
     ========================================================================== */

  // Destination from a Date label, e.g. "31 Oct 26 (Sat) - Phuket / With Fah" -> "Phuket"
  const placeOf = date => date.split(' - ').slice(1).join(' - ').replace(/\s*\/.*$/, '').trim();

  function renderFilterBar() {
    elements.filterBar.innerHTML = '';

    elements.filterBar.classList.toggle('two-level', state.activeSection === 'itinerary-section');

    if (state.activeSection === 'itinerary-section') {
      const dateOf = item => (item.Date || item.Day || '').trim();
      const dates = [...new Set(state.itinerary.map(dateOf).filter(Boolean))];
      const places = [...new Set(dates.map(placeOf).filter(Boolean))];
      const hasHighlights = state.itinerary.some(item => HIGHLIGHT_ITINERARY_IMAGES.has((item.Image || '').trim()));
      const loc = state.activeLocation;

      const addRow = (label, entries, isActive, onPick) => {
        const row = document.createElement('div');
        row.className = 'filter-row';
        row.setAttribute('role', 'group');
        row.setAttribute('aria-label', label);
        entries.forEach(([value, text]) => {
          const chip = document.createElement('button');
          chip.className = `filter-chip ${isActive(value) ? 'active' : ''}`;
          chip.textContent = text;
          chip.setAttribute('aria-pressed', isActive(value));
          chip.addEventListener('click', () => { onPick(value); renderFilterBar(); renderItinerary(); });
          row.appendChild(chip);
        });
        elements.filterBar.appendChild(row);
      };

      addRow('Destination',
        [['ALL', 'All Days'], ...(hasHighlights ? [['HIGHLIGHT', 'Highlights']] : []), ...places.map(p => [p, p])],
        v => v === loc,
        v => {
          state.activeLocation = v;
          // a destination opens on its first day; days are browsed one at a time
          state.activeItineraryFilter = dates.find(d => placeOf(d) === v) || 'ALL';
        });

      if (loc !== 'ALL' && loc !== 'HIGHLIGHT') {
        const days = dates.filter(d => placeOf(d) === loc);
        addRow('Day',
          days.map(d => [d, d.split(' - ')[0].replace(' 26', '')]),
          v => v === state.activeItineraryFilter,
          v => { state.activeItineraryFilter = v; });
      }
    } else if (state.activeSection === 'restaurants-section') {
      // Unique types in CSV order (Highlights already appears first in the data), "All Dining" last
      const types = [...new Set(state.restaurants.map(item => item.Type.split('•')[0].trim())), 'ALL'];
      types.forEach(type => {
        const chip = document.createElement('button');
        chip.className = `filter-chip ${state.activeRestaurantFilter === type ? 'active' : ''}`;
        chip.textContent = type === 'ALL' ? 'All Dining' : type;
        chip.addEventListener('click', () => {
          state.activeRestaurantFilter = type;
          renderFilterBar();
          renderRestaurants();
        });
        elements.filterBar.appendChild(chip);
      });
    }
  }

  /* ==========================================================================
     6. ITINERARY RENDERER (VERTICAL TIMELINE)
     ========================================================================== */

  // Optional "Menu" pill (same look as the Map pill) for rows with a Menu_Link
  function menuLinkHTML(url) {
    url = (url || '').trim();
    if (!url) return '';
    return `
      <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" class="amap-pill-btn" title="Open Menu">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Menu
      </a>
    `;
  }

  function renderItinerary() {
    let filtered = state.itinerary;

    // Filter by Highlights, or by destination then day
    const loc = state.activeLocation;
    if (loc === 'HIGHLIGHT') {
      filtered = filtered.filter(item => HIGHLIGHT_ITINERARY_IMAGES.has((item.Image || '').trim()));
    } else if (loc !== 'ALL') {
      filtered = filtered.filter(item => placeOf((item.Date || item.Day || '').trim()) === loc);
      if (state.activeItineraryFilter !== 'ALL') {
        filtered = filtered.filter(item => (item.Date || item.Day) === state.activeItineraryFilter);
      }
    }

    // Filter by Search Query
    if (state.searchQuery) {
      filtered = filtered.filter(item => 
        (item.Topic && item.Topic.toLowerCase().includes(state.searchQuery)) ||
        (item.Detail && item.Detail.toLowerCase().includes(state.searchQuery)) ||
        ((item.Date || item.Day) && (item.Date || item.Day).toLowerCase().includes(state.searchQuery)) ||
        (item.Time && item.Time.toLowerCase().includes(state.searchQuery))
      );
    }

    if (filtered.length === 0) {
      elements.itineraryContainer.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
          <p>No itinerary activities match your search criteria.</p>
        </div>
      `;
      return;
    }

    // Group items by Date
    const grouped = {};
    filtered.forEach(item => {
      const dateKey = (item.Date || item.Day || '').trim();
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(item);
    });

    let html = '';

    for (const [date, items] of Object.entries(grouped)) {
      html += `
        <div class="timeline-day-group">
          <div class="timeline-day-header">
            <span class="timeline-day-dot"></span>
            <span class="timeline-day-title">${escapeHTML(date)}</span>
          </div>
          <div class="timeline-items-wrapper">
      `;

      items.forEach(item => {
        const hasImage = Boolean(item.Image && typeof item.Image === 'string' && item.Image.trim() !== '');
        const mapUrl = (item.Map || item.Amap || '').trim();
        const hasMap = Boolean(mapUrl !== '');
        const hasTimeSpent = Boolean(item.Time_spent && typeof item.Time_spent === 'string' && item.Time_spent.trim() !== '' && item.Time_spent.trim() !== '-');

        const topicText = (item.Topic && typeof item.Topic === 'string' && item.Topic.trim() !== '')
          ? item.Topic.trim()
          : (item.Detail && typeof item.Detail === 'string' ? item.Detail.trim() : '');

        const detailText = (item.Topic && item.Detail && typeof item.Detail === 'string' && item.Detail.trim() !== '' && item.Detail.trim() !== item.Topic.trim())
          ? item.Detail.trim()
          : '';

        const hasDetail = Boolean(detailText !== '');

        const imageHTML = hasImage ? `
          <div class="timeline-thumb-wrapper">
            <img src="${escapeHTML(item.Image.trim())}" alt="${escapeHTML(topicText || 'Itinerary activity')}" class="timeline-thumb" loading="lazy" onerror="this.onerror=null; if(this.closest('.timeline-card')) { this.closest('.timeline-card').classList.remove('has-image'); this.closest('.timeline-card').classList.add('no-image'); } if(this.parentNode) this.parentNode.remove();">
          </div>
        ` : '';

        const mapHTML = hasMap ? `
          <a href="${escapeHTML(mapUrl)}" target="_blank" rel="noopener noreferrer" class="amap-pill-btn" title="Open Map">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Map
          </a>
        ` : '';

        html += `
          <div class="timeline-card ${hasImage ? 'has-image' : 'no-image'}">
            ${imageHTML}
            <div class="timeline-card-content">
              <div class="timeline-card-meta">
                ${(item.Time || '').trim() && item.Time.trim() !== '-' ? `<span class="time-pill">${escapeHTML(item.Time)}</span>` : ''}
                ${hasTimeSpent ? `
                <span class="duration-pill">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  ${escapeHTML(item.Time_spent)}
                </span>
                ` : ''}
                ${mapHTML}
                ${menuLinkHTML(item.Menu_Link)}
              </div>
              <h3 class="timeline-topic-title">${escapeHTML(topicText)}</h3>
              ${hasDetail ? `<p class="timeline-detail-desc">${escapeHTML(detailText)}</p>` : ''}
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    elements.itineraryContainer.innerHTML = html;
  }

  /* ==========================================================================
     7. RESTAURANTS RENDERER (CARDS GRID/LIST)
     ========================================================================== */

  // Options column: "Name|map url||Name|map url" -> alternative places to eat for the same stop
  function optionsHTML(raw) {
    const opts = (raw || '').split('||').map(s => s.trim()).filter(Boolean).map(s => {
      const [name, url] = s.split('|').map(x => (x || '').trim());
      return { name, url };
    }).filter(o => o.name);
    if (!opts.length) return '';
    return `
      <div class="restaurant-options-block">
        <span class="restaurant-block-label">🍽️ Where to eat (pick any option):</span>
        <ul class="restaurant-options-list">
          ${opts.map(o => `
            <li>
              <span class="restaurant-option-name">${escapeHTML(o.name)}</span>
              ${o.url ? `<a href="${escapeHTML(o.url)}" target="_blank" rel="noopener noreferrer" class="amap-pill-btn" title="Open Map">Map</a>` : ''}
            </li>`).join('')}
        </ul>
      </div>
    `;
  }

  function renderRestaurants() {
    let filtered = state.restaurants;

    // Filter by Type
    if (state.activeRestaurantFilter !== 'ALL') {
      filtered = filtered.filter(item => (item.Type || '').toLowerCase().includes(state.activeRestaurantFilter.toLowerCase()));
    }

    // Filter by Search Query
    if (state.searchQuery) {
      filtered = filtered.filter(item => 
        (item.List && item.List.toLowerCase().includes(state.searchQuery)) ||
        (item.Story && item.Story.toLowerCase().includes(state.searchQuery)) ||
        (item.Food && item.Food.toLowerCase().includes(state.searchQuery)) ||
        (item.Menu && item.Menu.toLowerCase().includes(state.searchQuery)) ||
        (item.Recommended_Day && item.Recommended_Day.toLowerCase().includes(state.searchQuery)) ||
        (item.Address && item.Address.toLowerCase().includes(state.searchQuery))
      );
    }

    if (filtered.length === 0) {
      elements.restaurantsGrid.innerHTML = `
        <div style="text-align: center; grid-column: 1/-1; padding: 3rem; color: var(--text-muted);">
          <p>No dining spots match your search criteria.</p>
        </div>
      `;
      return;
    }

    let html = '';

    filtered.forEach(item => {
      const hasImage = Boolean(item.Image && typeof item.Image === 'string' && item.Image.trim() !== '');
      const mapUrl = (item.Map || item.Amap || '').trim();
      const hasMap = Boolean(mapUrl !== '');
      const hasPrice = Boolean(item.Price && typeof item.Price === 'string' && item.Price.trim() !== '');
      const hasType = Boolean(item.Type && typeof item.Type === 'string' && item.Type.trim() !== '');

      const storyText = (item.Story && typeof item.Story === 'string' && item.Story.trim() !== '') 
        ? item.Story.trim() 
        : (item.Food && typeof item.Food === 'string' ? item.Food.trim() : '');

      const menuText = (item.Menu && typeof item.Menu === 'string') ? item.Menu.trim() : '';
      const recommendedDayText = (item.Recommended_Day && typeof item.Recommended_Day === 'string') ? item.Recommended_Day.trim() : '';

      const imageHTML = hasImage ? `
        <div class="restaurant-img-wrapper">
          <img src="${escapeHTML(item.Image.trim())}" alt="${escapeHTML(item.List || 'Restaurant spot')}" class="restaurant-img" loading="lazy" onerror="this.onerror=null; if(this.closest('.restaurant-card')) { this.closest('.restaurant-card').classList.remove('has-image'); this.closest('.restaurant-card').classList.add('no-image'); } if(this.parentNode) this.parentNode.remove();">
          ${hasPrice ? `<span class="price-badge">${escapeHTML(item.Price)}</span>` : ''}
          ${hasType ? `<span class="type-badge" data-type="${escapeHTML(item.Type)}">${escapeHTML(item.Type)}</span>` : ''}
        </div>
      ` : '';

      const inlineBadgesHTML = (!hasImage && (hasPrice || hasType)) ? `
        <div class="restaurant-badges-inline">
          ${hasPrice ? `<span class="price-badge-inline">${escapeHTML(item.Price)}</span>` : ''}
          ${hasType ? `<span class="type-badge-inline" data-type="${escapeHTML(item.Type)}">${escapeHTML(item.Type)}</span>` : ''}
        </div>
      ` : '';

      const mapHTML = hasMap ? `
        <a href="${escapeHTML(mapUrl)}" target="_blank" rel="noopener noreferrer" class="amap-btn" title="Open Map">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Map
        </a>
      ` : '';

      html += `
        <div class="restaurant-card ${hasImage ? 'has-image' : 'no-image'}">
          ${imageHTML}
          <div class="restaurant-info">
            <div class="restaurant-content-top">
              ${inlineBadgesHTML}
              <h3 class="restaurant-name">${escapeHTML(item.List)}</h3>
              
              ${recommendedDayText !== '' ? `
              <div class="restaurant-day-chip">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span><strong>Recommended day:</strong> ${escapeHTML(recommendedDayText)}</span>
              </div>
              ` : ''}

              ${menuText !== '' ? `
              <div class="restaurant-menu-block">
                <span class="restaurant-block-label">⭐ Must-try dishes:</span>
                <p class="restaurant-menu-text">${escapeHTML(menuText)}</p>
              </div>
              ` : ''}

              ${optionsHTML(item.Options)}

              ${storyText !== '' ? `
              <div class="restaurant-story-block">
                <details class="restaurant-story-details">
                  <summary class="restaurant-story-summary">
                    <span>🏛️ Highlights & popularity</span>
                    <svg class="details-chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <p class="restaurant-story-text">${escapeHTML(storyText)}</p>
                </details>
              </div>
              ` : ''}
            </div>

            <div class="restaurant-footer-row">
              ${(item.Address && item.Address.trim() !== '') ? `
              <p class="restaurant-address">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                ${escapeHTML(item.Address)}
              </p>
              ` : ''}
              ${mapHTML}
              ${menuLinkHTML(item.Menu_Link)}
            </div>
          </div>
        </div>
      `;
    });

    elements.restaurantsGrid.innerHTML = html;
  }

  /* ==========================================================================
     8. UTILITIES
     ========================================================================== */

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showLoadingState() {
    if (elements.itineraryContainer) elements.itineraryContainer.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading itinerary data...</div>`;
    if (elements.restaurantsGrid) elements.restaurantsGrid.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading restaurant data...</div>`;
  }

  function showErrorState(msg) {
    const errorHTML = `<div style="text-align: center; padding: 2rem; color: var(--badge-danger-text);">Error loading data: ${escapeHTML(msg)}</div>`;
    if (elements.itineraryContainer) elements.itineraryContainer.innerHTML = errorHTML;
    if (elements.restaurantsGrid) elements.restaurantsGrid.innerHTML = errorHTML;
  }

})();
