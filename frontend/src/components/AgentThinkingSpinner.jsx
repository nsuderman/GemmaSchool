export default function AgentThinkingSpinner({ className = '' }) {
  return (
    <span className={`agent-thinking-bars ${className}`} aria-label="Agent thinking" role="status">
      <span className="agent-thinking-bar" />
      <span className="agent-thinking-bar" />
      <span className="agent-thinking-bar" />
      <span className="agent-thinking-bar" />
      <span className="agent-thinking-bar" />
    </span>
  )
}
