import { Link } from "react-router-dom";

export const DemoVideo = () => {
  return (
    <section className="py-10 md:py-16">
      <div className="max-w-[960px] mx-auto px-4 sm:px-8 text-center">
        <h2 className="text-2xl md:text-4xl font-bold mb-3 text-[#0a0a0a]">
          See Nadir in 60 seconds
        </h2>
        <p className="text-[#666] text-base md:text-lg mb-8 max-w-[560px] mx-auto">
          A quick tour of the dashboard: API keys, live routing, savings, logs.
        </p>

        <div
          className="relative rounded-xl overflow-hidden border border-[#e5e5e5] shadow-lg bg-[#f5f5f5]"
          style={{ paddingBottom: "75%", height: 0 }}
        >
          <iframe
            src="https://www.tella.tv/video/vid_cmo4ivdrz00e904jpdc6d20yg/embed?b=1&title=1&a=1&loop=0&t=0&muted=0&wt=1&o=1"
            title="Getting Started with the Nadir Dashboard"
            allow="autoplay; fullscreen"
            className="absolute top-0 left-0 w-full h-full border-0"
          />
        </div>

        <div className="mt-8">
          <Link
            to="/auth?mode=signup"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#0a0a0a] text-white rounded-md text-[15px] font-semibold hover:bg-[#333] hover:-translate-y-px hover:shadow-lg transition-all no-underline"
          >
            Try Free for 30 Days
          </Link>
          <p className="text-[13px] text-[#999] mt-3">
            No credit card required. Only pay for what we save you.
          </p>
        </div>
      </div>
    </section>
  );
};
