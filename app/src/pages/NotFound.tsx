import { useLocation } from "react-router-dom";
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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <p className="text-6xl font-semibold text-foreground mb-2">404</p>
        <p className="text-muted-foreground mb-6">This page doesn't exist.</p>
        <a href="/" className="text-sm text-primary hover:underline">
          Back to dashboard
        </a>
      </div>
    </div>
  );
};

export default NotFound;
