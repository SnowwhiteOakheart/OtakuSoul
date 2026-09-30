import { useState } from 'react';
import { ImageIcon, Maximize2, Minimize2, X } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';

/** The latest scene image of the open chat, generated from the story (HUD camera button). */
export const SceneImageCard = () => {
  const { t } = useTranslation();
  const { activeChatId, chatSceneImages, dismissChatSceneImage } = useStoreFields(
    'activeChatId', 'chatSceneImages', 'dismissChatSceneImage',
  );
  const [expanded, setExpanded] = useState(false);
  const image = activeChatId ? chatSceneImages[activeChatId] : undefined;
  if (!activeChatId || !image) return null;

  return (
    <figure className="shrink-0 border-b border-slate-800 bg-slate-900/70 px-4 py-2 flex items-start gap-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? t('chat.sceneImageCollapse') : t('chat.sceneImageExpand')}
        className="shrink-0 rounded-lg overflow-hidden border border-slate-700 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        <img
          src={image.base64_data_url}
          alt={t('chat.sceneImageAlt')}
          className={`${expanded ? 'max-h-[60vh]' : 'h-24'} w-auto object-contain bg-app transition-all`}
        />
      </button>
      <figcaption className="flex-1 min-w-0 text-xs text-slate-400 space-y-1">
        <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
          <ImageIcon className="w-3.5 h-3.5 text-accent-400" />
          {t('chat.sceneImageTitle')}
        </div>
        <p className={expanded ? 'whitespace-pre-wrap' : 'line-clamp-3'} title={image.prompt_used}>
          {image.prompt_used}
        </p>
      </figcaption>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? t('chat.sceneImageCollapse') : t('chat.sceneImageExpand')}
          title={expanded ? t('chat.sceneImageCollapse') : t('chat.sceneImageExpand')}
          className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800"
        >
          {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => dismissChatSceneImage(activeChatId)}
          aria-label={t('chat.sceneImageClose')}
          title={t('chat.sceneImageClose')}
          className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </figure>
  );
};
