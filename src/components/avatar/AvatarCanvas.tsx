import { useState } from 'react';
import { VrmViewer } from './VrmViewer';
import { Box, Image, Sparkles } from 'lucide-react';
import { CharacterProfile } from '../../types';

interface AvatarCanvasProps {
  character: CharacterProfile | null;
  isSpeaking?: boolean;
}

export const AvatarCanvas = ({
  character,
  isSpeaking = false,
}: AvatarCanvasProps) => {
  const [avatarMode, setAvatarMode] = useState<'3d' | '2d'>('3d');

  const defaultVrmPath =
    '/home/deathtrap/development/Soul-of-Waifu-linux/assets/emotions/vrm/Anime Girl.vrm';

  const avatarUrl = character?.avatar_data_url;
  const charName = character?.card.data.name || 'OtakuSoul Companion';

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden border-r border-slate-800 bg-slate-950/80">
      {/* Top Mode Selector */}
      <div className="absolute top-3 right-3 z-30 flex items-center bg-slate-900/80 p-0.5 rounded-lg border border-slate-700/60 text-xs backdrop-blur shadow-md">
        <button
          onClick={() => setAvatarMode('3d')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
            avatarMode === '3d'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Box className="w-3 h-3" />
          <span>3D VRM</span>
        </button>
        <button
          onClick={() => setAvatarMode('2d')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
            avatarMode === '2d'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Image className="w-3 h-3" />
          <span>2D Porträt</span>
        </button>
      </div>

      {/* Main Avatar Display */}
      {avatarMode === '3d' ? (
        <VrmViewer modelPath={defaultVrmPath} isSpeaking={isSpeaking} />
      ) : (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-900/60 via-purple-950/30 to-slate-950">
          {avatarUrl ? (
            <div className="relative group max-w-sm rounded-3xl overflow-hidden border-2 border-purple-500/40 shadow-2xl shadow-purple-500/10 transition-all duration-700 hover:scale-[1.02]">
              <img
                src={avatarUrl}
                alt={charName}
                className={`w-full max-h-[70vh] object-cover transition-all duration-500 ${
                  isSpeaking ? 'scale-[1.02] filter brightness-105' : ''
                }`}
              />
              {/* Speaking audio wave indicator */}
              {isSpeaking && (
                <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-900/80 border border-purple-500/60 text-purple-200 text-xs font-mono animate-pulse backdrop-blur">
                  <Sparkles className="w-3.5 h-3.5 text-pink-400 animate-spin" />
                  <span>Spricht...</span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-48 h-48 rounded-full bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white text-5xl font-bold border-4 border-purple-500/50 shadow-2xl">
              {charName.charAt(0)}
            </div>
          )}

          <div className="mt-4 text-center">
            <h3 className="text-lg font-bold text-slate-100">{charName}</h3>
            <p className="text-xs text-purple-300/80 font-mono mt-0.5">
              {character?.card.data.personality || '2D Anime Avatar Mode'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
