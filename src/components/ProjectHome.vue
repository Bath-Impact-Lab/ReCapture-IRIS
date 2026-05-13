<template>
  <div class="project-home">
    <div class="home-container">

      <header class="home-header">
        <h1 class="home-title">Welcome to ReCapture</h1>
        <p class="home-subtitle">Select an option to begin your biomechanics session.</p>
      </header>

      <div class="action-cards">
        <button class="action-card" @click="emit('new-project')">
          <div class="card-icon new-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="12" y1="8" x2="12" y2="16"></line>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
          </div>
          <div class="card-text">
            <h3>New Project</h3>
            <p>Create a fresh tracking workspace</p>
          </div>
        </button>

        <button class="action-card" @click="emit('open-project')">
          <div class="card-icon open-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div class="card-text">
            <h3>Open Existing</h3>
            <p>Browse for an existing project file</p>
          </div>
        </button>
      </div>

      <div class="recent-projects">
        <h2 class="section-title">Recent Projects</h2>

        <div v-if="recentProjects.length > 0" class="recent-list">
          <button
            v-for="project in recentProjects"
            :key="project.path"
            class="recent-item"
            @click="emit('open-recent', project.path)"
          >
            <div class="recent-info">
              <svg class="recent-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
              <span class="recent-name">{{ project.name }}</span>
            </div>
            <span class="recent-date">{{ project.date }}</span>
          </button>
        </div>

        <div v-else class="empty-state">
          No recent projects found.
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RecentProjectEntry } from '../lib/useProject';

interface Props {
  recentProjects?: RecentProjectEntry[];
}

const props = withDefaults(defineProps<Props>(), {
  recentProjects: () => [],
});

const emit = defineEmits<{
  'new-project': [];
  'open-project': [];
  'open-recent': [path: string];
}>();

const recentProjects = computed(() =>
  props.recentProjects.map((project) => ({
    ...project,
    date: formatRecentDate(project.lastOpenedAt),
  }))
);

function formatRecentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';

  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffHours < 48) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}
</script>

<style scoped>
/* Container & Background */
.project-home {
  --home-ink: #e8f0f9;
  --home-muted: #a6b7cb;
  --home-accent: #57a9ff;
  --home-card-bg: rgba(16, 26, 40, 0.78);
  --home-card-border: rgba(139, 177, 220, 0.2);
  --home-surface: rgba(255, 255, 255, 0.03);
  --home-shadow: 0 18px 36px rgba(0, 0, 0, 0.24);
  position: absolute;
  inset: var(--app-topbar-height, 63px) 0 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(90% 70% at 50% -10%, rgba(87, 169, 255, 0.16) 0%, rgba(24, 42, 63, 0) 70%),
    linear-gradient(180deg, #0f1a28 0%, #111e2d 52%, #132536 100%);
  overflow-y: auto;
  padding: 40px 20px;
  isolation: isolate;
}

[data-theme="light"] .project-home {
  --home-ink: #13314b;
  --home-muted: #647a92;
  --home-accent: #1f7ed7;
  --home-card-bg: #fbfdff;
  --home-card-border: rgba(22, 82, 136, 0.14);
  --home-surface: rgba(255, 255, 255, 0.68);
  --home-shadow: 0 22px 44px rgba(23, 80, 128, 0.11);
  background:
    radial-gradient(82% 55% at 50% -8%, rgba(74, 150, 218, 0.16) 0%, rgba(174, 213, 241, 0) 76%),
    linear-gradient(180deg, #f8fcff 0%, #f0f6fb 62%, #ebf2f8 100%);
}

.project-home::before,
.project-home::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.project-home::before {
  background:
    radial-gradient(58% 32% at 16% 18%, rgba(84, 162, 228, 0.2) 0%, rgba(84, 162, 228, 0) 100%),
    radial-gradient(64% 34% at 86% 78%, rgba(62, 146, 220, 0.12) 0%, rgba(62, 146, 220, 0) 100%);
}

.project-home::after {
  opacity: 0.33;
  background:
    repeating-linear-gradient(
      115deg,
      rgba(31, 126, 215, 0.06) 0 2px,
      transparent 2px 26px
    );
}

.home-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 48px;
  animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Header */
.home-header {
  position: relative;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.home-title {
  margin: 0 0 10px 0;
  font-size: clamp(2.1rem, 4.1vw, 2.8rem);
  font-weight: 700;
  color: var(--home-ink);
  letter-spacing: -0.028em;
  line-height: 1.05;
}

.home-subtitle {
  margin: 0;
  font-size: clamp(0.98rem, 2vw, 1.06rem);
  color: var(--home-muted);
  line-height: 1.55;
  max-width: 540px;
}


/* Action Cards */
.action-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 16px;
  padding: 24px;
  background: var(--home-card-bg);
  border: 1px solid var(--home-card-border);
  border-radius: 16px;
  box-shadow: var(--home-shadow);
  cursor: pointer;
  transition: transform 0.25s ease, background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
}

.action-card:hover {
  transform: translateY(-4px);
  border-color: rgba(31, 126, 215, 0.34);
  box-shadow: 0 20px 34px rgba(13, 54, 88, 0.2);
}

[data-theme="light"] .action-card:hover {
  background: #ffffff;
  border-color: rgba(31, 126, 215, 0.32);
  box-shadow: 0 20px 36px rgba(20, 76, 124, 0.14);
}

.action-card:active {
  transform: translateY(-1px);
}

.card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
}

.new-icon {
  background: rgba(31, 126, 215, 0.12);
  color: var(--home-accent);
}

.open-icon {
  background: rgba(31, 126, 215, 0.16);
  color: #2b95ed;
}

[data-theme="light"] .new-icon {
  background: rgba(31, 126, 215, 0.11);
  color: #1f7ed7;
}
[data-theme="light"] .open-icon {
  background: rgba(55, 145, 219, 0.13);
  color: #1972c1;
}

.card-text h3 {
  margin: 0 0 6px 0;
  font-size: 1.18rem;
  font-weight: 650;
  color: var(--home-ink);
  letter-spacing: -0.01em;
}

.card-text p {
  margin: 0;
  font-size: 0.86rem;
  color: var(--home-muted);
  line-height: 1.5;
}

/* Recent Projects */
.recent-projects {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--home-muted) 78%, transparent);
  padding-bottom: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--home-muted) 26%, transparent);
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 14px 16px;
  background: var(--home-surface);
  border: 1px solid color-mix(in srgb, var(--home-muted) 22%, transparent);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(6, 29, 49, 0.08);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.recent-item:hover {
  border-color: rgba(31, 126, 215, 0.28);
  box-shadow: 0 12px 28px rgba(13, 54, 88, 0.16);
}

[data-theme="light"] .recent-item:hover {
  background: #ffffff;
  border-color: rgba(22, 82, 136, 0.2);
  box-shadow: 0 14px 28px rgba(20, 76, 124, 0.11);
}

.recent-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.recent-icon {
  color: var(--home-accent);
}

.recent-name {
  font-size: 0.95rem;
  font-weight: 620;
  color: var(--home-ink);
}

.recent-date {
  font-size: 0.8rem;
  color: var(--home-muted);
}

.empty-state {
  padding: 24px;
  text-align: center;
  font-size: 0.9rem;
  color: var(--home-muted);
  background: var(--home-surface);
  border-radius: 12px;
  border: 1px dashed color-mix(in srgb, var(--home-muted) 36%, transparent);
}

[data-theme="light"] .empty-state {
  background: rgba(255, 255, 255, 0.74);
  border-color: rgba(22, 82, 136, 0.24);
}

/* Animations */
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Mobile Responsiveness */
@media (max-width: 600px) {
  .action-cards {
    grid-template-columns: 1fr;
  }

  .home-title {
    font-size: 1.9rem;
  }

  .hero-motif {
    height: 92px;
    margin-bottom: 12px;
  }

  .recent-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
}
</style>
