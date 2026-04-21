import { Composition } from 'remotion';
import { SpaceRouter } from './SpaceRouter';
import { SideBySide } from './SideBySide';
import { ChatRouter } from './ChatRouter';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SpaceRouter"
        component={SpaceRouter}
        durationInFrames={150}
        fps={30}
        width={512}
        height={512}
      />
      <Composition
        id="SideBySide"
        component={SideBySide}
        durationInFrames={820}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ChatRouter"
        component={ChatRouter}
        durationInFrames={720}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ mode: 'dark' as const }}
      />
      <Composition
        id="ChatRouterLight"
        component={ChatRouter}
        durationInFrames={720}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ mode: 'light' as const }}
      />
    </>
  );
};

