import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { logger } from "@/utils/logger";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="text-center max-w-[480px]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#028a3e] mb-4">
          404 · Wrong tier, wrong route
        </p>
        <h1 className="text-[56px] sm:text-[72px] font-semibold tracking-[-0.035em] text-[#1d1d1f] leading-[1.04] mb-4">
          We couldn't route you there.
        </h1>
        <p className="text-[16px] md:text-[18px] text-[#424245] leading-[1.5] tracking-[-0.005em] mb-8">
          The page <code className="font-mono text-[0.9em] bg-black/[0.04] px-1.5 py-0.5 rounded">{location.pathname}</code> doesn't exist, or it moved. Head back home and we'll pick a better destination.
        </p>
        <Link
          to="/"
          className="inline-flex items-center px-6 py-[14px] bg-[#1d1d1f] text-white rounded-full text-[15px] font-medium hover:bg-[#000] transition-colors tracking-[-0.01em] no-underline shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
