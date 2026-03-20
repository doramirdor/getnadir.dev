import { motion } from "framer-motion";

export const ClusterIcon = () => {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <svg
        viewBox="0 0 400 400"
        className="w-full h-full max-w-[300px]"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Top Left Cluster */}
        <motion.ellipse
          cx="100" cy="80" rx="70" ry="60"
          fill="none" stroke="hsl(var(--primary))" strokeWidth="5" strokeDasharray="8,6"
          animate={{ scale: [1, 1.05, 1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.rect x="60" y="40" width="30" height="30" rx="8" fill="hsl(var(--primary))"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{ opacity: 1 }}
        />
        <motion.rect x="120" y="35" width="30" height="30" rx="8" fill="hsl(var(--primary))"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          style={{ opacity: 0.8 }}
        />
        <motion.rect x="85" y="90" width="30" height="30" rx="8" fill="hsl(var(--primary))"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          style={{ opacity: 0.8 }}
        />

        {/* Top Right Cluster */}
        <motion.ellipse
          cx="300" cy="100" rx="80" ry="70"
          fill="none" stroke="hsl(var(--primary))" strokeWidth="5" strokeDasharray="8,6"
          animate={{ scale: [1, 1.05, 1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        />
        <motion.rect x="270" y="50" width="30" height="30" rx="8" fill="hsl(var(--primary))"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
          style={{ opacity: 1 }}
        />
        <motion.rect x="260" y="110" width="30" height="30" rx="8" fill="hsl(var(--primary))"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          style={{ opacity: 0.8 }}
        />
        <motion.rect x="315" y="80" width="30" height="30" rx="8" fill="hsl(var(--primary))"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          style={{ opacity: 0.8 }}
        />

        {/* Bottom Cluster */}
        <motion.ellipse
          cx="200" cy="280" rx="120" ry="70"
          fill="none" stroke="hsl(var(--primary))" strokeWidth="5" strokeDasharray="8,6"
          animate={{ scale: [1, 1.05, 1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
        <motion.rect x="120" y="260" width="30" height="30" rx="8" fill="hsl(var(--primary))"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
          style={{ opacity: 1 }}
        />
        <motion.rect x="185" y="250" width="30" height="30" rx="8" fill="hsl(var(--primary))"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}
          style={{ opacity: 0.8 }}
        />
        <motion.rect x="250" y="265" width="30" height="30" rx="8" fill="hsl(var(--primary))"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1.6 }}
          style={{ opacity: 0.8 }}
        />
        <motion.rect x="200" y="300" width="30" height="30" rx="8" fill="hsl(var(--primary))"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1.8 }}
          style={{ opacity: 0.8 }}
        />
      </svg>
    </div>
  );
};
