type Props = {
  suggestions: string[]
  onSelect: (message: string) => void
  visible: boolean
}

export function MessageHelpers({ suggestions, onSelect, visible }: Props) {
  if (!visible || suggestions.length === 0) return null

  return (
    <div className="messageHelpers">
      {suggestions.map((suggestion, idx) => (
        <button
          key={idx}
          type="button"
          className="messageHelper"
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
