import { useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Clock,
  Map,
  Navigation,
  Plane,
  RadioTower,
  Route,
  ShieldCheck,
  UploadCloud,
  Utensils,
  Zap,
} from 'lucide-react'
import './App.css'
import { DigitalTwinViewport } from './components/DigitalTwinViewport'
import { viewportAsset } from './data/assetRegistry'
import { drones, missionTimeline, routeCandidates } from './data/commandCenterData'
import { localeOptions, translations, type Locale } from './i18n/translations'

function getCopyValue(record: Readonly<Record<string, string>>, key: string, fallback: string): string {
  return record[key] ?? fallback
}

function App() {
  const [locale, setLocale] = useState<Locale>('zhHant')
  const primaryRoute = routeCandidates[0]
  const copy = translations[locale]

  return (
    <main className="command-shell" lang={copy.htmlLang}>
      <header className="topbar">
        <div>
          <h1>{copy.title}</h1>
        </div>
        <div className="topbar-actions">
          <nav aria-label="Command center sections">
            <a href="#terrain">{copy.nav.terrain}</a>
            <a href="#assets">{copy.nav.assets}</a>
            <a href="#interfaces">{copy.nav.interfaces}</a>
          </nav>
          <div className="language-switcher" role="group" aria-label={copy.languageSwitcherLabel}>
            {localeOptions.map((option) => (
              <button
                className={`language-option ${locale === option.id ? 'active' : ''}`}
                type="button"
                aria-pressed={locale === option.id}
                title={option.label}
                key={option.id}
                onClick={() => setLocale(option.id)}
              >
                <span>{option.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="operations-grid" aria-label={copy.sections.operations}>
        <aside className="side-panel fleet-panel" aria-label={copy.sections.fleet}>
          <PanelTitle icon={<Plane size={18} />} label={copy.sections.fleet} />
          <div className="fleet-list">
            {drones.map((drone) => (
              <article className="fleet-row" key={drone.id}>
                <div>
                  <strong>{drone.callsign}</strong>
                  <span>{getCopyValue(copy.droneLocations, drone.id, drone.location.label)}</span>
                </div>
                <div className="fleet-stat">
                  <span>{drone.batteryPercent}%</span>
                  <small>{copy.droneStatus[drone.status]}</small>
                </div>
              </article>
            ))}
          </div>
        </aside>

        <section className="viewport-panel" id="terrain" aria-label={copy.sections.viewport}>
          <div className="viewport-toolbar">
            <div>
              <h2>{copy.viewport.title}</h2>
            </div>
            <div className="viewport-live-indicator">
              <span aria-hidden="true" />
              {copy.viewport.live}
            </div>
          </div>
          <div className="terrain-stage">
            <DigitalTwinViewport
              heightmapPath={viewportAsset.heightmapPath}
              texturePath={viewportAsset.texturePath}
              fallbackImagePath={viewportAsset.renderPath}
              routeGeoJsonPath={viewportAsset.routeGeoJsonPath}
              manifestPath={viewportAsset.geeManifestPath}
              alt={copy.viewport.alt}
              resetLabel={copy.viewport.resetView}
            />
            <div className="scanline" aria-hidden="true" />
            <div className="terrain-badge">
              <Navigation size={14} />
              <span>{copy.viewport.badge}</span>
            </div>
          </div>
          <div className="viewport-footer">
            <StatusPill icon={<ShieldCheck size={15} />} label={copy.viewport.airspaceLabel} value={copy.viewport.airspaceValue} />
            <StatusPill icon={<Utensils size={15} />} label={copy.viewport.zoneLabel} value={copy.viewport.zoneValue} />
            <StatusPill icon={<Activity size={15} />} label={copy.viewport.viewLabel} value={copy.viewport.viewValue} />
          </div>
        </section>

        <aside className="side-panel route-panel" aria-label={copy.sections.route}>
          <PanelTitle icon={<Route size={18} />} label={copy.route.panelTitle} />
          <article className="route-card">
            <span className="status-chip attention">{copy.routeStatus[primaryRoute.status]}</span>
            <h3>{copy.route.name}</h3>
            <p>{copy.route.description}</p>
            <div className="route-meta" aria-label={copy.route.metricsAria}>
              <span>
                <strong>{primaryRoute.distanceKm.toFixed(2)}</strong>
                {copy.route.distanceUnit}
              </span>
              <span>
                <strong>{primaryRoute.estimatedMinutes}</strong>
                {copy.route.minutesUnit}
              </span>
              <span>
                <strong>{primaryRoute.riskScore.toFixed(3)}</strong>
                {copy.route.riskUnit}
              </span>
              <span>
                <strong>{primaryRoute.waypoints.length}</strong>
                {copy.route.waypointUnit}
              </span>
            </div>
            <button className="command-button" type="button" aria-label={copy.route.uploadAria}>
              <UploadCloud size={18} />
              {copy.route.upload}
            </button>
          </article>
          <div className="interface-stack" id="interfaces">
            <InterfaceRow icon={<Activity size={17} />} label={copy.interfaces.matsim} value={copy.interfaces.matsimValue} />
            <InterfaceRow icon={<RadioTower size={17} />} label={copy.interfaces.telemetry} value={copy.interfaces.telemetryValue} />
            <InterfaceRow icon={<Map size={17} />} label={copy.interfaces.mapStack} value={copy.interfaces.mapStackValue} />
          </div>
        </aside>
      </section>

      <section className="metric-band" aria-label={copy.sections.metrics}>
        {copy.metrics.map((metric) => (
          <article className="metric" key={`${locale}-${metric.label}`}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.trend}</small>
          </article>
        ))}
      </section>

      <section className="data-section" id="assets" aria-label={copy.sections.assets}>
        <div className="data-column">
          <PanelTitle icon={<Zap size={18} />} label={copy.data.operationTools} />
          <div className="action-grid">
            <ActionButton icon={<Utensils size={18} />} label={copy.actions.newOrder} tone="blue" />
            <ActionButton icon={<Plane size={18} />} label={copy.actions.dispatchFleet} tone="green" />
            <ActionButton icon={<UploadCloud size={18} />} label={copy.actions.importRoute} tone="yellow" />
            <ActionButton icon={<ShieldCheck size={18} />} label={copy.actions.clearance} tone="blue" />
            <ActionButton icon={<Clock size={18} />} label={copy.actions.kitchenWindow} tone="red" />
            <ActionButton icon={<Navigation size={18} />} label={copy.actions.returnHome} tone="green" />
          </div>
        </div>
        <div className="data-column">
          <PanelTitle icon={<RadioTower size={18} />} label={copy.data.partnerInterfaces} />
          <div className="interface-stack partner-stack">
            <InterfaceRow icon={<Route size={17} />} label={copy.collaboration.routeAlgorithm} value={copy.collaboration.routeAlgorithmValue} />
            <InterfaceRow icon={<Map size={17} />} label={copy.collaboration.trafficSimulation} value={copy.collaboration.trafficSimulationValue} />
            <InterfaceRow icon={<Utensils size={17} />} label={copy.collaboration.restaurantOps} value={copy.collaboration.restaurantOpsValue} />
            <InterfaceRow icon={<Activity size={17} />} label={copy.collaboration.operationsApi} value={copy.collaboration.operationsApiValue} />
          </div>
        </div>
      </section>

      <section className="timeline" aria-label={copy.sections.timeline}>
        <PanelTitle icon={<AlertTriangle size={18} />} label={copy.sections.timeline} />
        <div className="timeline-grid">
          {missionTimeline.map((event, index) => (
            <article className={`timeline-event ${event.status}`} key={`${event.time}-${event.label}`}>
              <span>{event.time}</span>
              <strong>{copy.timeline[index]?.label ?? event.label}</strong>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

interface PanelTitleProps {
  readonly icon: ReactNode
  readonly label: string
}

function PanelTitle({ icon, label }: PanelTitleProps) {
  return (
    <div className="panel-title">
      {icon}
      <span>{label}</span>
    </div>
  )
}

interface StatusPillProps {
  readonly icon: ReactNode
  readonly label: string
  readonly value: string
}

function StatusPill({ icon, label, value }: StatusPillProps) {
  return (
    <div className="status-pill">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

interface InterfaceRowProps {
  readonly icon: ReactNode
  readonly label: string
  readonly value: string
}

function InterfaceRow({ icon, label, value }: InterfaceRowProps) {
  return (
    <div className="interface-row">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

interface ActionButtonProps {
  readonly icon: ReactNode
  readonly label: string
  readonly tone: 'blue' | 'green' | 'red' | 'yellow'
}

function ActionButton({ icon, label, tone }: ActionButtonProps) {
  return (
    <button className={`action-button ${tone}`} type="button">
      {icon}
      <span>{label}</span>
    </button>
  )
}

export default App
