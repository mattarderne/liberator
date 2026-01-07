/**
 * Thread Visualization Module
 * Interactive graph with filtering, display modes, and embedding insights
 */

const COLORS = {
  provider: {
    chatgpt: '#74d4a5',
    claude: '#d4a574',
    gemini: '#7494d4',
    grok: '#d474a5',
    copilot: '#a5a5d4',
  },
  status: {
    new: '#5cb3ff',
    in_progress: '#ffdb5c',
    complete: '#5cff8a',
    on_hold: '#ffa85c',
    abandoned: '#ff5c5c',
  },
  category: {
    work: '#5cb3ff',
    personal: '#ff8a5c',
    home: '#5cff8a',
    hobbies: '#d45cff',
    finance: '#5cffdb',
    health: '#ff5c8a',
    learning: '#ffdb5c',
    admin: '#a5a5d4',
    other: '#8e8e8e',
  },
};

class ThreadVisualization {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.allNodes = [];
    this.allEdges = [];
    this.nodes = [];
    this.edges = [];
    this.colorBy = options.colorBy || 'category';
    this.displayMode = options.displayMode || 'title';
    this.highlightRelated = true;
    this.onNodeSelect = options.onNodeSelect || (() => {});

    this.filters = {
      status: '',
      category: '',
      provider: '',
      tags: [],
      linkedOnly: false,
      withEmbedding: false,
    };

    this.selectedNode = null;
    this.hoveredNode = null;
    this.highlightedIds = new Set();
    this.isDragging = false;
    this.dragNode = null;
    this.isPanning = false;
    this.pan = { x: 0, y: 0 };
    this.zoom = 1;
    this.lastMousePos = { x: 0, y: 0 };

    this.renderScheduled = false;

    this.setupEventListeners();
    this.resize();
  }

  setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.canvas.addEventListener('dblclick', this.onDoubleClick.bind(this));
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const sidebarWidth = 300;
    this.canvas.width = rect.width - sidebarWidth;
    this.canvas.height = rect.height;
    this.scheduleRender();
  }

  setData(nodes, edges) {
    this.allNodes = nodes;
    this.allEdges = edges;
    this.applyFilters();
  }

  setFilters(filters) {
    this.filters = { ...this.filters, ...filters };
    this.applyFilters();
  }

  setDisplayMode(mode) {
    const wasAlwaysShow = this.displayMode.startsWith('always-');
    const isAlwaysShow = mode.startsWith('always-');
    this.displayMode = mode;

    // Re-layout if switching to/from always-show modes (need more/less space)
    if (wasAlwaysShow !== isAlwaysShow) {
      this.applyFilters();
    } else {
      this.scheduleRender();
    }
  }

  isAlwaysShowMode() {
    return this.displayMode.startsWith('always-');
  }

  setHighlightRelated(enabled) {
    this.highlightRelated = enabled;
    this.updateHighlights();
    this.scheduleRender();
  }

  highlightNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) {
      this.selectedNode = node;
      this.updateHighlights();
      this.onNodeSelect(node);
      this.scheduleRender();
    }
  }

  updateHighlights() {
    this.highlightedIds.clear();
    if (!this.selectedNode || !this.highlightRelated) return;

    // Add linked threads
    for (const edge of this.edges) {
      if (edge.source === this.selectedNode.id) {
        this.highlightedIds.add(edge.target);
      } else if (edge.target === this.selectedNode.id) {
        this.highlightedIds.add(edge.source);
      }
    }

    // Add similar threads
    if (this.selectedNode.similarThreads) {
      for (const sim of this.selectedNode.similarThreads) {
        this.highlightedIds.add(sim.id);
      }
    }
  }

  applyFilters() {
    let filtered = this.allNodes;

    if (this.filters.status) {
      filtered = filtered.filter((n) => n.status === this.filters.status);
    }
    if (this.filters.category) {
      filtered = filtered.filter((n) => n.category === this.filters.category);
    }
    if (this.filters.provider) {
      filtered = filtered.filter((n) => n.provider === this.filters.provider);
    }
    if (this.filters.tags && this.filters.tags.length > 0) {
      filtered = filtered.filter((n) => {
        if (!n.tags || n.tags.length === 0) return false;
        const nodeTags = n.tags.map((t) => t.toLowerCase());
        return this.filters.tags.some((t) => nodeTags.includes(t.toLowerCase()));
      });
    }
    if (this.filters.linkedOnly) {
      const linkedIds = new Set();
      for (const e of this.allEdges) {
        if (e.type === 'link') {
          linkedIds.add(e.source);
          linkedIds.add(e.target);
        }
      }
      filtered = filtered.filter((n) => linkedIds.has(n.id));
    }
    if (this.filters.withEmbedding) {
      filtered = filtered.filter((n) => n.hasEmbedding);
    }

    const visibleIds = new Set(filtered.map((n) => n.id));
    this.edges = this.allEdges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));

    this.layoutNodes(filtered);
    this.pan = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    this.zoom = 1;
    this.scheduleRender();
  }

  layoutNodes(nodes) {
    if (nodes.length === 0) {
      this.nodes = [];
      return;
    }

    // Expand layout when showing all titles
    const alwaysShow = this.isAlwaysShowMode();
    const spacingMultiplier = alwaysShow ? 2.5 : 1;

    const width = (this.canvas.width - 120) * spacingMultiplier;
    const height = (this.canvas.height - 120) * spacingMultiplier;

    const byCategory = new Map();
    for (const node of nodes) {
      const cat = node.category || 'other';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(node);
    }

    const categories = Array.from(byCategory.keys());
    const numCats = categories.length || 1;

    this.nodes = [];
    categories.forEach((cat, catIdx) => {
      const catNodes = byCategory.get(cat);
      const angle = (catIdx / numCats) * Math.PI * 2 - Math.PI / 2;
      const catCenterX = Math.cos(angle) * (width / 3);
      const catCenterY = Math.sin(angle) * (height / 3);

      // More spacing between nodes in always-show mode
      const baseRadius = alwaysShow ? 80 : 40;
      const radiusGrowth = alwaysShow ? 12 : 4;
      const maxRadius = alwaysShow ? 250 : 100;

      catNodes.forEach((node, nodeIdx) => {
        let x, y;
        if (node.hasEmbedding && node.x !== undefined) {
          x = node.x * (width / 4) * 0.5 + catCenterX * 0.5;
          y = node.y * (height / 4) * 0.5 + catCenterY * 0.5;
        } else {
          const nodeAngle = (nodeIdx / Math.max(catNodes.length, 6)) * Math.PI * 2;
          const radius = Math.min(baseRadius + catNodes.length * radiusGrowth, maxRadius);
          x = catCenterX + Math.cos(nodeAngle) * radius;
          y = catCenterY + Math.sin(nodeAngle) * radius;
        }

        this.nodes.push({
          ...node,
          x,
          y,
          radius: Math.max(6, Math.min(14, 6 + (node.message_count || 0) / 5)),
        });
      });
    });

    this.resolveOverlaps();
  }

  resolveOverlaps() {
    // More spacing when showing all titles
    const alwaysShow = this.isAlwaysShowMode();
    const minDist = alwaysShow ? 80 : 18;
    const passes = alwaysShow ? 10 : 3;

    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < this.nodes.length; i++) {
        for (let j = i + 1; j < this.nodes.length; j++) {
          const a = this.nodes[i];
          const b = this.nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
          if (dist < minDist) {
            const push = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
          }
        }
      }
    }
  }

  setColorBy(colorBy) {
    this.colorBy = colorBy;
    this.scheduleRender();
  }

  getNodeColor(node) {
    const scheme = COLORS[this.colorBy] || COLORS.category;
    const value = node[this.colorBy] || 'other';
    return scheme[value] || '#8e8e8e';
  }

  scheduleRender() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.render();
    });
  }

  getNodeLabel(node) {
    const title = node.title || 'Untitled';
    switch (this.displayMode) {
      case 'title-line':
      case 'always-line':
        return node.firstLine ? `${title}\n${node.firstLine}` : title;
      case 'title-message':
        return node.firstMessage ? `${title}\n${node.firstMessage.slice(0, 150)}...` : title;
      case 'always-title':
      case 'title':
      default:
        return title;
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.pan.x, this.pan.y);
    ctx.scale(this.zoom, this.zoom);

    this.drawCategoryLabels(ctx);

    // Draw edges
    for (const edge of this.edges) {
      const source = this.nodes.find((n) => n.id === edge.source);
      const target = this.nodes.find((n) => n.id === edge.target);
      if (!source || !target) continue;

      const isHighlighted = this.selectedNode &&
        (edge.source === this.selectedNode.id || edge.target === this.selectedNode.id);

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);

      if (edge.type === 'similarity') {
        const alpha = isHighlighted ? 0.8 : (edge.similarity || 0.8) * 0.4;
        ctx.strokeStyle = `rgba(16, 163, 127, ${alpha})`;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = (isHighlighted ? 2 : 1) / this.zoom;
      } else {
        const alpha = isHighlighted ? 1 : 0.5;
        ctx.strokeStyle = `rgba(255, 180, 80, ${alpha})`;
        ctx.setLineDash([]);
        ctx.lineWidth = (isHighlighted ? 3 : 2) / this.zoom;
      }
      ctx.stroke();
    }

    ctx.setLineDash([]);

    // Draw nodes
    for (const node of this.nodes) {
      const isSelected = node === this.selectedNode;
      const isHovered = node === this.hoveredNode;
      const isHighlighted = this.highlightedIds.has(node.id);
      const isDimmed = this.selectedNode && !isSelected && !isHighlighted && this.highlightRelated;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

      let color = this.getNodeColor(node);
      if (isDimmed) {
        ctx.globalAlpha = 0.3;
      } else if (isHighlighted) {
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Border
      if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3 / this.zoom;
        ctx.stroke();
      } else if (isHovered) {
        ctx.strokeStyle = '#10a37f';
        ctx.lineWidth = 2 / this.zoom;
        ctx.stroke();
      } else if (isHighlighted) {
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2 / this.zoom;
        ctx.stroke();
      } else if (!node.hasEmbedding) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1 / this.zoom;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label - show for selected/hovered OR always in always-show mode
      const alwaysShow = this.isAlwaysShowMode();
      const showLabel = isSelected || isHovered || alwaysShow;

      if (showLabel) {
        const label = this.getNodeLabel(node);
        const lines = label.split('\n').slice(0, alwaysShow ? 2 : 3);

        // Smaller font for always-show mode to fit more labels
        const fontSize = alwaysShow ? 8 : 10;
        ctx.font = `${isSelected || isHovered ? 'bold ' : ''}${fontSize / this.zoom}px -apple-system, sans-serif`;
        ctx.textAlign = 'center';

        const lineHeight = (fontSize + 2) / this.zoom;
        const maxCharWidth = alwaysShow ? 30 : 50;
        const displayLines = lines.map(l => l.slice(0, maxCharWidth) + (l.length > maxCharWidth ? '…' : ''));
        const maxWidth = Math.max(...displayLines.map(l => ctx.measureText(l).width));
        const boxHeight = displayLines.length * lineHeight + 4 / this.zoom;
        const labelY = node.y - node.radius - boxHeight - 4 / this.zoom;

        // More transparent background for always-show mode unless selected/hovered
        const bgAlpha = (isSelected || isHovered) ? 0.9 : (isDimmed ? 0.3 : 0.7);
        ctx.fillStyle = `rgba(0,0,0,${bgAlpha})`;
        ctx.fillRect(
          node.x - maxWidth / 2 - 4 / this.zoom,
          labelY,
          maxWidth + 8 / this.zoom,
          boxHeight
        );

        // Dimmer text when not selected in always-show mode
        const textAlpha = (isSelected || isHovered) ? 1 : (isDimmed ? 0.4 : 0.85);
        ctx.fillStyle = `rgba(255,255,255,${textAlpha})`;
        displayLines.forEach((line, i) => {
          ctx.fillText(line, node.x, labelY + (i + 1) * lineHeight);
        });
      }
    }

    ctx.restore();

    if (this.nodes.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No threads match filters', w / 2, h / 2);
    }
  }

  drawCategoryLabels(ctx) {
    const byCategory = new Map();
    for (const node of this.nodes) {
      const cat = node.category || 'other';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(node);
    }

    // Draw cluster backgrounds first
    for (const [cat, catNodes] of byCategory) {
      if (catNodes.length < 2) continue;

      // Calculate bounding box with padding
      const padding = 30;
      const minX = Math.min(...catNodes.map((n) => n.x)) - padding;
      const maxX = Math.max(...catNodes.map((n) => n.x)) + padding;
      const minY = Math.min(...catNodes.map((n) => n.y)) - padding;
      const maxY = Math.max(...catNodes.map((n) => n.y)) + padding;

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const radiusX = (maxX - minX) / 2;
      const radiusY = (maxY - minY) / 2;

      // Get category color
      const color = COLORS.category[cat] || '#8e8e8e';

      // Draw ellipse background with gradient
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);

      // Create radial gradient for soft edges
      const gradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, Math.max(radiusX, radiusY)
      );
      gradient.addColorStop(0, this.hexToRgba(color, 0.15));
      gradient.addColorStop(0.7, this.hexToRgba(color, 0.08));
      gradient.addColorStop(1, this.hexToRgba(color, 0));

      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw subtle border
      ctx.strokeStyle = this.hexToRgba(color, 0.3);
      ctx.lineWidth = 1 / this.zoom;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Draw category labels
    ctx.font = `bold ${10 / this.zoom}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';

    for (const [cat, catNodes] of byCategory) {
      if (catNodes.length === 0) continue;
      const avgX = catNodes.reduce((sum, n) => sum + n.x, 0) / catNodes.length;
      const minY = Math.min(...catNodes.map((n) => n.y));

      // Draw label with background pill
      const label = cat.toUpperCase();
      const textWidth = ctx.measureText(label).width;
      const pillPadding = 6 / this.zoom;
      const pillHeight = 14 / this.zoom;
      const labelY = minY - 30 / this.zoom;

      const color = COLORS.category[cat] || '#8e8e8e';
      ctx.fillStyle = this.hexToRgba(color, 0.8);
      ctx.beginPath();
      ctx.roundRect(
        avgX - textWidth / 2 - pillPadding,
        labelY - pillHeight / 2 - 2 / this.zoom,
        textWidth + pillPadding * 2,
        pillHeight,
        pillHeight / 2
      );
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, avgX, labelY + 3 / this.zoom);
    }
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  screenToWorld(x, y) {
    return {
      x: (x - this.pan.x) / this.zoom,
      y: (y - this.pan.y) / this.zoom,
    };
  }

  getNodeAtPosition(x, y) {
    const world = this.screenToWorld(x, y);
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      const dx = world.x - node.x;
      const dy = world.y - node.y;
      if (Math.sqrt(dx * dx + dy * dy) <= node.radius) return node;
    }
    return null;
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const node = this.getNodeAtPosition(x, y);
    if (node) {
      this.dragNode = node;
      this.selectedNode = node;
      this.updateHighlights();
      this.onNodeSelect(node);
      this.isPanning = false;
    } else {
      this.dragNode = null;
      this.isPanning = true;
    }

    this.isDragging = true;
    this.lastMousePos = { x, y };
    this.scheduleRender();
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (!this.isDragging) {
      const node = this.getNodeAtPosition(x, y);
      if (node !== this.hoveredNode) {
        this.hoveredNode = node;
        this.canvas.style.cursor = node ? 'pointer' : 'grab';
        this.scheduleRender();
      }
    }

    if (this.isDragging) {
      const dx = x - this.lastMousePos.x;
      const dy = y - this.lastMousePos.y;

      if (this.dragNode) {
        this.dragNode.x += dx / this.zoom;
        this.dragNode.y += dy / this.zoom;
      } else if (this.isPanning) {
        this.pan.x += dx;
        this.pan.y += dy;
      }

      this.lastMousePos = { x, y };
      this.scheduleRender();
    }
  }

  onMouseUp() {
    this.isDragging = false;
    this.dragNode = null;
    this.isPanning = false;
  }

  onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.3, Math.min(4, this.zoom * delta));

    const worldBefore = this.screenToWorld(x, y);
    this.zoom = newZoom;
    const worldAfter = this.screenToWorld(x, y);

    this.pan.x += (worldAfter.x - worldBefore.x) * this.zoom;
    this.pan.y += (worldAfter.y - worldBefore.y) * this.zoom;

    this.scheduleRender();
  }

  onDoubleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const node = this.getNodeAtPosition(e.clientX - rect.left, e.clientY - rect.top);
    if (node) {
      window.selectThread?.(node.id);
      document.getElementById('viz-modal')?.classList.remove('active');
    }
  }

  destroy() {}
}

// Controller
let vizInstance = null;

function initVisualization() {
  const modal = document.getElementById('viz-modal');
  const canvas = document.getElementById('viz-canvas');
  const closeBtn = document.getElementById('viz-close');
  const generateBtn = document.getElementById('viz-generate-btn');

  const statusFilter = document.getElementById('viz-status-filter');
  const categoryFilter = document.getElementById('viz-category-filter');
  const providerFilter = document.getElementById('viz-provider-filter');
  const tagsFilter = document.getElementById('viz-tags-filter');
  const linkedOnlyCheck = document.getElementById('viz-linked-only');
  const withEmbeddingCheck = document.getElementById('viz-with-embedding');
  const highlightRelatedCheck = document.getElementById('viz-highlight-related');
  const displayModeSelect = document.getElementById('viz-display-mode');
  const colorBySelect = document.getElementById('viz-color-by');
  const similaritySlider = document.getElementById('viz-similarity');
  const similarityValue = document.getElementById('viz-similarity-value');

  const statusEl = document.getElementById('viz-status');
  const statsEl = document.getElementById('viz-stats');
  const legendEl = document.getElementById('viz-legend');
  const sidebarEl = document.getElementById('viz-sidebar');

  let currentData = null;

  document.getElementById('visualize-btn')?.addEventListener('click', () => {
    modal.classList.add('active');
    loadVisualizationData();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'v' && !e.metaKey && !e.ctrlKey && !isInputFocused()) {
      modal.classList.add('active');
      loadVisualizationData();
    }
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });

  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  function closeModal() {
    modal.classList.remove('active');
  }

  // Filters
  statusFilter?.addEventListener('change', applyFilters);
  categoryFilter?.addEventListener('change', applyFilters);
  providerFilter?.addEventListener('change', applyFilters);
  linkedOnlyCheck?.addEventListener('change', applyFilters);
  withEmbeddingCheck?.addEventListener('change', applyFilters);

  let tagsDebounce;
  tagsFilter?.addEventListener('input', () => {
    clearTimeout(tagsDebounce);
    tagsDebounce = setTimeout(applyFilters, 300);
  });

  highlightRelatedCheck?.addEventListener('change', () => {
    vizInstance?.setHighlightRelated(highlightRelatedCheck.checked);
  });

  displayModeSelect?.addEventListener('change', () => {
    vizInstance?.setDisplayMode(displayModeSelect.value);
  });

  colorBySelect?.addEventListener('change', () => {
    if (vizInstance) {
      vizInstance.setColorBy(colorBySelect.value);
      updateLegend(colorBySelect.value);
    }
  });

  similaritySlider?.addEventListener('input', () => {
    similarityValue.textContent = similaritySlider.value;
  });

  similaritySlider?.addEventListener('change', () => {
    loadVisualizationData(parseFloat(similaritySlider.value));
  });

  function applyFilters() {
    if (!vizInstance) return;
    const tags = (tagsFilter?.value || '').split(',').map((t) => t.trim()).filter((t) => t);
    vizInstance.setFilters({
      status: statusFilter?.value || '',
      category: categoryFilter?.value || '',
      provider: providerFilter?.value || '',
      tags,
      linkedOnly: linkedOnlyCheck?.checked || false,
      withEmbedding: withEmbeddingCheck?.checked || false,
    });
    updateStats();
  }

  generateBtn?.addEventListener('click', async () => {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
    showStatus('Generating embeddings...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_EMBEDDINGS',
        threadIds: null,
        forceRegenerate: false,
      });

      if (response.success) {
        showStatus(`Generated ${response.generated} embeddings`);
        setTimeout(() => loadVisualizationData(), 1000);
      } else {
        showStatus(`Error: ${response.error}`, true);
      }
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate Embeddings';
    }
  });

  chrome.runtime.onMessage?.addListener((msg) => {
    if (msg.type === 'EMBEDDING_PROGRESS') {
      showStatus(`Embedding ${msg.current}/${msg.total}...`);
    }
  });

  async function loadVisualizationData(threshold = 0.8) {
    showStatus('Loading...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_VISUALIZATION_DATA',
        similarityThreshold: threshold,
      });

      if (!response.success) {
        showStatus(`Error: ${response.error}`, true);
        return;
      }

      currentData = response;

      if (categoryFilter && response.categories) {
        const current = categoryFilter.value;
        categoryFilter.innerHTML = '<option value="">All</option>';
        response.categories.forEach((cat) => {
          const opt = document.createElement('option');
          opt.value = cat;
          opt.textContent = cat;
          categoryFilter.appendChild(opt);
        });
        categoryFilter.value = current;
      }

      if (!vizInstance) {
        vizInstance = new ThreadVisualization(canvas, {
          colorBy: colorBySelect?.value || 'category',
          displayMode: displayModeSelect?.value || 'title',
          onNodeSelect: showNodeDetails,
        });
      }

      vizInstance.setData(response.nodes, response.edges);
      applyFilters();
      vizInstance.resize();
      updateLegend(colorBySelect?.value || 'category');
      updateStats();
      hideStatus();
    } catch (err) {
      showStatus(`Error: ${err.message}`, true);
    }
  }

  function updateStats() {
    if (!currentData) return;
    const shown = vizInstance?.nodes?.length || 0;
    const total = currentData.threadsCount || 0;
    const embedded = currentData.embeddingsCount || 0;
    statsEl.textContent = `${shown}/${total} threads | ${embedded} embedded`;
  }

  function showNodeDetails(node) {
    // Get linked threads
    const linkedEdges = vizInstance?.allEdges?.filter(
      (e) => (e.source === node.id || e.target === node.id) && e.type === 'link'
    ) || [];

    const linkedThreads = linkedEdges.map((e) => {
      const otherId = e.source === node.id ? e.target : e.source;
      const otherNode = vizInstance?.allNodes?.find((n) => n.id === otherId);
      return otherNode ? { id: otherId, title: otherNode.title, type: e.linkType } : null;
    }).filter(Boolean);

    // Similar threads from embedding
    const similarThreads = node.similarThreads || [];

    sidebarEl.innerHTML = `
      <div class="viz-node-details">
        <h4>${escapeHtml(node.title || 'Untitled')}</h4>

        <div class="viz-node-meta">
          <span class="viz-meta-item">${node.provider}</span>
          <span class="viz-meta-item">${node.status || 'unknown'}</span>
          <span class="viz-meta-item">${node.category}</span>
          <span class="viz-meta-item">${node.message_count || 0} msgs</span>
        </div>

        ${node.tags?.length ? `
          <div class="viz-node-tags">
            ${node.tags.map((t) => `<span class="viz-tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}

        ${node.summary ? `
          <div class="viz-summary">
            <strong>Summary:</strong> ${escapeHtml(node.summary.slice(0, 200))}${node.summary.length > 200 ? '...' : ''}
          </div>
        ` : ''}

        <div class="viz-section">
          <div class="viz-section-header">
            <strong>Linked Threads (${linkedThreads.length})</strong>
          </div>
          ${linkedThreads.length > 0 ? `
            <div class="viz-thread-list">
              ${linkedThreads.map((t) => `
                <div class="viz-thread-item">
                  <span class="viz-thread-title" onclick="vizHighlightNode('${t.id}')">${escapeHtml(t.title?.slice(0, 40) || 'Untitled')}</span>
                  <button class="viz-open-btn" onclick="vizOpenThread('${t.id}')" title="Open thread">→</button>
                </div>
              `).join('')}
            </div>
          ` : '<div class="viz-empty">No linked threads</div>'}
        </div>

        <div class="viz-section">
          <div class="viz-section-header">
            <strong>Similar by Content (${similarThreads.length})</strong>
            ${node.hasEmbedding ? '' : '<span class="viz-no-embed">(no embedding)</span>'}
          </div>
          ${similarThreads.length > 0 ? `
            <div class="viz-thread-list">
              ${similarThreads.map((t) => `
                <div class="viz-thread-item">
                  <span class="viz-thread-title" onclick="vizHighlightNode('${t.id}')">${escapeHtml(t.title?.slice(0, 35) || 'Untitled')}</span>
                  <span class="viz-similarity">${Math.round(t.similarity * 100)}%</span>
                  <button class="viz-open-btn" onclick="vizOpenThread('${t.id}')" title="Open thread">→</button>
                </div>
              `).join('')}
            </div>
          ` : '<div class="viz-empty">No similar threads found</div>'}
        </div>

        <div class="viz-actions">
          <button class="viz-primary-btn" onclick="vizOpenThread('${node.id}')">
            Open Thread
          </button>
        </div>
      </div>
    `;
  }

  // Global functions for sidebar buttons
  window.vizOpenThread = (id) => {
    window.selectThread?.(id);
    document.getElementById('viz-modal')?.classList.remove('active');
  };

  window.vizHighlightNode = (id) => {
    vizInstance?.highlightNode(id);
  };

  function updateLegend(colorBy) {
    const scheme = COLORS[colorBy] || COLORS.category;
    legendEl.innerHTML = Object.entries(scheme)
      .map(([name, color]) => `
        <span class="viz-legend-item">
          <span class="viz-legend-dot" style="background: ${color}"></span>
          ${name}
        </span>
      `).join('');
  }

  function showStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.add('active');
    statusEl.style.color = isError ? '#ff5c5c' : '';
  }

  function hideStatus() {
    statusEl.classList.remove('active');
  }

  function isInputFocused() {
    const active = document.activeElement;
    return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVisualization);
} else {
  initVisualization();
}
