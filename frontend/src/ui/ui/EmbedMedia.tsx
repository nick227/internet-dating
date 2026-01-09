import { parseEmbedUrl, type EmbedInfo } from '../../core/media/embedMedia'

type Props = {
  url: string
  embed?: EmbedInfo | null
  title?: string
  className?: string
}

export function EmbedMedia({ url, embed, title, className = '' }: Props) {
  const info = embed ?? parseEmbedUrl(url)

  if (!info) {
    return (
      <div className={`embedMedia embedMedia--invalid ${className}`.trim()}>
        Unsupported embed
      </div>
    )
  }

  const frameTitle =
    title ?? (info.provider === 'youtube' ? 'YouTube embed' : 'SoundCloud embed')

  return (
    <div className={`embedMedia embedMedia--${info.provider} ${className}`.trim()}>
      <iframe
        className="embedMedia__frame"
        src={info.embedUrl}
        title={frameTitle}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen={info.provider === 'youtube'}
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  )
}
