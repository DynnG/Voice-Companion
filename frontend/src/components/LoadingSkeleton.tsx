import '../styles/loading-skeleton.css';

export function LoadingSkeleton({ label, cards = 1, light = false, bubble = false }: { label: string; cards?: number; light?: boolean; bubble?: boolean }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={`savi-skeleton ${light ? 'savi-skeleton--light' : ''} ${bubble ? 'savi-skeleton--user-bubble' : ''}`}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="savi-skeleton-stack">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="savi-skeleton-card">
            <div className="savi-skeleton-line savi-skeleton-line--label" />
            <div className="savi-skeleton-line" />
            <div className="savi-skeleton-line savi-skeleton-line--short" />
          </div>
        ))}
      </div>
    </div>
  );
}
