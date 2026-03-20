import { Button } from "@/components/ui/button";
import { useRef, forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { cn } from "@/lib/utils";

// Circle component for the animated beam visualization
const Circle = forwardRef<
  HTMLDivElement,
  { className?: string; children?: React.ReactNode }
>(({ className, children }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "z-10 flex size-8 lg:size-12 items-center justify-center rounded-full border-2 bg-white p-2 lg:p-3 shadow-[0_0_20px_-12px_rgba(0,0,0,0.8)]",
        className,
      )}
    >
      {children}
    </div>
  );
});

Circle.displayName = "Circle";

// Icons for the visualization
const Icons = {
  user: () => (
    <svg
      width="16"
      height="16"
      className="lg:w-6 lg:h-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  openai: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  ),
  anthropic: () => (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor">
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z"/>
    </svg>
  ),
  llama: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 9C5 7.3 6.3 6 8 6H16C17.7 6 19 7.3 19 9V16C19 18.2 17.2 20 15 20H9C6.8 20 5 18.2 5 16V9Z" fill="#F8F9FA" stroke="#2C3E50" strokeWidth="1.5"/>
      <path d="M6 8C6 6.9 6.9 6 8 6C8.6 6 9 5.6 9 5V3C9 2.4 8.6 2 8 2C6.3 2 5 3.3 5 5V7C5 7.6 5.4 8 6 8Z" fill="#F8F9FA" stroke="#2C3E50" strokeWidth="1.5"/>
      <path d="M18 8C18.6 8 19 7.6 19 7V5C19 3.3 17.7 2 16 2C15.4 2 15 2.4 15 3V5C15 5.6 15.4 6 16 6C17.1 6 18 6.9 18 8Z" fill="#F8F9FA" stroke="#2C3E50" strokeWidth="1.5"/>
      <circle cx="9" cy="11" r="1" fill="#2C3E50" />
      <circle cx="15" cy="11" r="1" fill="#2C3E50" />
      <ellipse cx="12" cy="14" rx="2.5" ry="1.8" fill="#F8F9FA" stroke="#2C3E50" strokeWidth="1.2"/>
      <ellipse cx="12" cy="13.5" rx="0.8" ry="0.5" fill="#2C3E50" />
    </svg>
  ),
  qwen: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 128 128" fill="none">
      <path d="M123.756 27.1541C122.505 26.5294 121.967 27.7199 121.236 28.3243C120.986 28.5193 120.774 28.7726 120.563 29.0064C118.734 30.9963 116.598 32.3035 113.808 32.1473C109.729 31.9135 106.246 33.2204 103.167 36.3999C102.513 32.479 100.339 30.1371 97.0292 28.6359C95.2974 27.8557 93.5465 27.0748 92.334 25.3777C91.4874 24.1687 91.2564 22.8223 90.8332 21.4957C90.564 20.6964 90.2939 19.8767 89.3896 19.7397C88.4083 19.5836 88.0229 20.4221 87.6387 21.1252C86.0991 23.9931 85.5027 27.1532 85.5608 30.3521C85.6959 37.5512 88.6781 43.2858 94.605 47.3637C95.2784 47.832 95.4512 48.3 95.2402 48.9828C94.836 50.3877 94.3549 51.7529 93.9317 53.1578C93.6622 54.0553 93.2574 54.2503 92.3149 53.8603C89.0632 52.4757 86.2532 50.4266 83.7708 47.9496C79.5566 43.7939 75.747 39.2095 70.9938 35.6196C69.8939 34.7906 68.7642 34.0032 67.6071 33.2592C62.758 28.4603 68.2423 24.5191 69.5121 24.0514C70.8397 23.5633 69.9741 21.886 65.6824 21.9054C61.3913 21.9249 57.4657 23.3878 52.4631 25.3388C51.7316 25.6319 50.9623 25.8463 50.173 26.0212C45.6318 25.1432 40.9174 24.9482 35.9911 25.5137C26.7159 26.5667 19.3082 31.0345 13.8626 38.6624C7.32048 47.833 5.7806 58.2498 7.66653 69.1162C9.64843 80.5671 15.3825 90.0486 24.1957 97.4621C33.3359 105.147 43.8618 108.913 55.8686 108.191C63.1613 107.762 71.2821 106.768 80.4413 98.8661C82.7505 100.036 85.1747 100.505 89.1967 100.856C92.2949 101.149 95.2774 100.7 97.5866 100.213C101.204 99.4326 100.954 96.0183 99.6454 95.3945C89.0435 90.3618 91.3708 92.41 89.2545 90.7517C93.943 85.0987 100.701 79.2535 104.469 63.4192C105.372 59.6224 105.938 55.3802 105.938 51.4034C105.938 50.6068 106.111 50.2138 107.073 50.116C109.728 49.8034 112.307 49.063 114.674 47.7358C121.543 43.9121 124.314 37.6305 124.969 30.1004C125.065 28.9497 124.95 27.7585 123.756 27.1541ZM63.8934 94.9249C53.6175 86.6932 48.634 83.9808 46.5752 84.098C44.6511 84.2153 44.9972 86.4588 45.4205 87.9217C45.8628 89.3656 46.4408 90.3602 47.2486 91.6282C47.8066 92.4673 48.1917 93.7152 46.6909 94.6525C43.3814 96.7392 37.6276 93.95 37.3578 93.813C30.6616 89.7944 25.0619 84.4883 21.1169 77.2315C17.3072 70.2468 15.094 62.7565 14.7288 54.7578C14.6326 52.8268 15.1909 52.1431 17.0762 51.7927C19.5582 51.324 22.1175 51.2262 24.5999 51.5968C35.0868 53.1578 44.015 57.9373 51.5006 65.5063C55.7726 69.8171 59.0052 74.968 62.3348 80.0007C65.8753 85.3459 69.6853 90.4379 74.5344 94.6127C76.2471 96.0756 77.6129 97.1878 78.9217 98.0075C74.9767 98.4558 68.3955 98.5536 63.8934 94.9249ZM68.8635 62.2637C69.0263 61.5911 69.6203 61.0983 70.3396 61.0983C70.517 61.0987 70.6928 61.1317 70.8588 61.1955C71.0707 61.2738 71.263 61.3911 71.4171 61.566C71.6862 61.8396 71.8404 62.2296 71.8404 62.639C71.8404 63.4976 71.167 64.18 70.3205 64.18C69.9632 64.1834 69.6166 64.0552 69.3446 63.8191C69.0725 63.5831 68.8931 63.2549 68.8394 62.8948C68.8061 62.6849 68.8143 62.4703 68.8635 62.2637ZM83.6208 70.8385C82.8061 71.1558 81.9953 71.4049 81.2116 71.4374C79.7489 71.5151 78.1521 70.9105 77.2865 70.1691C75.9398 69.0184 74.9776 68.3751 74.5735 66.3649C74.4003 65.5063 74.4962 64.18 74.6504 63.4192C74.9967 61.7804 74.6116 60.7268 73.4768 59.7711C72.5534 58.9908 71.379 58.7764 70.0901 58.7764C69.609 58.7764 69.1667 58.562 68.8394 58.3865C68.3005 58.1138 67.8581 57.4307 68.2814 56.5916C68.4164 56.3189 69.0707 55.6552 69.2248 55.5386C70.9754 54.5239 72.9964 54.8556 74.8623 55.6164C76.5941 56.3383 77.903 57.6646 79.7886 59.5372C81.7127 61.7998 82.059 62.4246 83.1563 64.1217C84.0225 65.448 84.8112 66.8141 85.3501 68.3742C85.6243 69.1901 85.3723 69.8843 84.6183 70.374C84.3116 70.5731 83.959 70.7066 83.6208 70.8385Z" fill="#4D6BFE"/>
    </svg>
  ),
  mistral: () => (
    <svg width="24" height="24" viewBox="0 0 256 233" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <g>
        <rect fill="#000000" x="186.181818" y="0" width="46.5454545" height="46.5454545"/>
        <rect fill="#F7D046" x="209.454545" y="0" width="46.5454545" height="46.5454545"/>
        <rect fill="#000000" x="0" y="0" width="46.5454545" height="46.5454545"/>
        <rect fill="#000000" x="0" y="46.5454545" width="46.5454545" height="46.5454545"/>
        <rect fill="#000000" x="0" y="93.0909091" width="46.5454545" height="46.5454545"/>
        <rect fill="#000000" x="0" y="139.636364" width="46.5454545" height="46.5454545"/>
        <rect fill="#000000" x="0" y="186.181818" width="46.5454545" height="46.5454545"/>
        <rect fill="#F7D046" x="23.2727273" y="0" width="46.5454545" height="46.5454545"/>
        <rect fill="#F2A73B" x="209.454545" y="46.5454545" width="46.5454545" height="46.5454545"/>
        <rect fill="#F2A73B" x="23.2727273" y="46.5454545" width="46.5454545" height="46.5454545"/>
        <rect fill="#000000" x="139.636364" y="46.5454545" width="46.5454545" height="46.5454545"/>
        <rect fill="#F2A73B" x="162.909091" y="46.5454545" width="46.5454545" height="46.5454545"/>
        <rect fill="#F2A73B" x="69.8181818" y="46.5454545" width="46.5454545" height="46.5454545"/>
        <rect fill="#EE792F" x="116.363636" y="93.0909091" width="46.5454545" height="46.5454545"/>
        <rect fill="#EE792F" x="162.909091" y="93.0909091" width="46.5454545" height="46.5454545"/>
        <rect fill="#EE792F" x="69.8181818" y="93.0909091" width="46.5454545" height="46.5454545"/>
        <rect fill="#000000" x="93.0909091" y="139.636364" width="46.5454545" height="46.5454545"/>
        <rect fill="#EB5829" x="116.363636" y="139.636364" width="46.5454545" height="46.5454545"/>
        <rect fill="#EE792F" x="209.454545" y="93.0909091" width="46.5454545" height="46.5454545"/>
        <rect fill="#EE792F" x="23.2727273" y="93.0909091" width="46.5454545" height="46.5454545"/>
        <rect fill="#000000" x="186.181818" y="139.636364" width="46.5454545" height="46.5454545"/>
        <rect fill="#EB5829" x="209.454545" y="139.636364" width="46.5454545" height="46.5454545"/>
        <rect fill="#000000" x="186.181818" y="186.181818" width="46.5454545" height="46.5454545"/>
        <rect fill="#EB5829" x="23.2727273" y="139.636364" width="46.5454545" height="46.5454545"/>
        <rect fill="#EA3326" x="209.454545" y="186.181818" width="46.5454545" height="46.5454545"/>
        <rect fill="#EA3326" x="23.2727273" y="186.181818" width="46.5454545" height="46.5454545"/>
      </g>
    </svg>
  ),
  google: () => (
    <svg width="24" height="24" viewBox="0 0 256 262" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
      <g>
        <path d="M255.878,133.451 C255.878,122.717 255.007,114.884 253.122,106.761 L130.55,106.761 L130.55,155.209 L202.497,155.209 C201.047,167.249 193.214,185.381 175.807,197.565 L175.563,199.187 L214.318,229.21 L217.003,229.478 C241.662,206.704 255.878,173.196 255.878,133.451" fill="#4285F4"/>
        <path d="M130.55,261.1 C165.798,261.1 195.389,249.495 217.003,229.478 L175.807,197.565 C164.783,205.253 149.987,210.62 130.55,210.62 C96.027,210.62 66.726,187.847 56.281,156.37 L54.75,156.5 L14.452,187.687 L13.925,189.152 C35.393,231.798 79.49,261.1 130.55,261.1" fill="#34A853"/>
        <path d="M56.281,156.37 C53.525,148.247 51.93,139.543 51.93,130.55 C51.93,121.556 53.525,112.853 56.136,104.73 L56.063,103 L15.26,71.312 L13.925,71.947 C5.077,89.644 0,109.517 0,130.55 C0,151.583 5.077,171.455 13.925,189.152 L56.281,156.37" fill="#FBBC05"/>
        <path d="M130.55,50.479 C155.064,50.479 171.6,61.068 181.029,69.917 L217.873,33.943 C195.245,12.91 165.798,0 130.55,0 C79.49,0 35.393,29.301 13.925,71.947 L56.136,104.73 C66.726,73.253 96.027,50.479 130.55,50.479" fill="#EB4335"/>
      </g>
    </svg>
  ),
};

// AnimatedBeamVisualization component
export function AnimatedBeamVisualization({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const aiRouterRef = useRef<HTMLDivElement>(null);
  const openaiRef = useRef<HTMLDivElement>(null);
  const googleRef = useRef<HTMLDivElement>(null);
  const llamaRef = useRef<HTMLDivElement>(null);
  const qwenRef = useRef<HTMLDivElement>(null);
  const mistralRef = useRef<HTMLDivElement>(null);
  const anthropicRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={cn(
        "relative flex h-[500px] w-full items-center justify-center overflow-hidden rounded-lg p-10",
        className,
      )}
      ref={containerRef}
    >
      <div className="flex size-full max-w-4xl flex-row items-stretch justify-between gap-2 lg:gap-8">
        <div className="flex flex-col justify-center">
          <Circle ref={userRef} className="bg-blue-50 border-blue-200">
            <Icons.user />
          </Circle>
        </div>

        <div className="flex flex-col justify-center">
          <Circle ref={aiRouterRef} className="size-12 lg:size-20 bg-white border-gray-300 shadow-xl">
            <span className="text-xs lg:text-base font-semibold text-foreground">Nadir</span>
          </Circle>
        </div>

        <div className="flex flex-col justify-center gap-2">
          <Circle ref={openaiRef} className="hidden lg:flex bg-green-50 border-green-200">
            <Icons.openai />
          </Circle>
          <Circle ref={googleRef} className="bg-blue-50 border-blue-200">
            <Icons.google />
          </Circle>
          <Circle ref={llamaRef} className="bg-purple-50 border-purple-200">
            <Icons.llama />
          </Circle>
          <Circle ref={qwenRef} className="bg-teal-50 border-teal-200">
            <Icons.qwen />
          </Circle>
          <Circle ref={mistralRef} className="bg-indigo-50 border-indigo-200">
            <Icons.mistral />
          </Circle>
          <Circle ref={anthropicRef} className="hidden lg:flex bg-orange-50 border-orange-200">
            <Icons.anthropic />
          </Circle>
        </div>
      </div>

      <AnimatedBeam
        containerRef={containerRef}
        fromRef={userRef}
        toRef={aiRouterRef}
        duration={3}
        pathColor="hsl(var(--primary))"
        pathWidth={4}
        pathOpacity={0.4}
        gradientStartColor="hsl(var(--primary))"
        gradientStopColor="hsl(var(--primary)/0.8)"
        endXOffset={-6}
        endYOffset={0}
      />

      <AnimatedBeam
        containerRef={containerRef}
        fromRef={aiRouterRef}
        toRef={openaiRef}
        duration={3}
        delay={0.2}
        pathColor="#10b981"
        pathOpacity={0.3}
        gradientStartColor="#10b981"
        gradientStopColor="#10b981"
        startXOffset={6}
        endXOffset={-6}
        className="hidden lg:block"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={aiRouterRef}
        toRef={googleRef}
        duration={3}
        delay={0.4}
        pathColor="#3b82f6"
        pathOpacity={0.3}
        gradientStartColor="#3b82f6"
        gradientStopColor="#3b82f6"
        startXOffset={6}
        endXOffset={-6}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={aiRouterRef}
        toRef={llamaRef}
        duration={3}
        delay={0.6}
        pathColor="#8b5cf6"
        pathOpacity={0.3}
        gradientStartColor="#8b5cf6"
        gradientStopColor="#8b5cf6"
        startXOffset={6}
        endXOffset={-6}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={aiRouterRef}
        toRef={qwenRef}
        duration={3}
        delay={0.8}
        pathColor="#14b8a6"
        pathOpacity={0.3}
        gradientStartColor="#14b8a6"
        gradientStopColor="#14b8a6"
        startXOffset={6}
        endXOffset={-6}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={aiRouterRef}
        toRef={mistralRef}
        duration={3}
        delay={1.0}
        pathColor="#6366f1"
        pathOpacity={0.3}
        gradientStartColor="#6366f1"
        gradientStopColor="#6366f1"
        startXOffset={6}
        endXOffset={-6}
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={aiRouterRef}
        toRef={anthropicRef}
        duration={3}
        delay={1.2}
        pathColor="#f97316"
        pathOpacity={0.4}
        gradientStartColor="#f97316"
        gradientStopColor="#f97316"
        startXOffset={6}
        endXOffset={-6}
        className="hidden lg:block"
      />
    </div>
  );
}

export const HeroSection = () => {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate("/dashboard");
  };

  return (
    <section className="container mx-auto px-6 pt-24 pb-20 lg:py-40 min-h-screen flex items-center">
      <div className="w-full">
        {/* Mobile Layout */}
        <div className="lg:hidden space-y-8 animate-fade-up text-center">
          <div className="space-y-6">
            <h1 className="text-5xl md:text-6xl font-bold leading-tight text-foreground">
              Your LLM Gateway, Simplified
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
              Zero Downtime, slash cost, boost performance, no hassle.
            </p>
          </div>

          <div className="py-4">
            <AnimatedBeamVisualization className="h-[180px] p-2" />
          </div>

          <div className="space-y-3 max-w-md mx-auto">
            <Button
              onClick={handleGetStarted}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-6 py-3 rounded-xl text-base h-12 w-full"
            >
              Get Started Free
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Free trial &middot; No credit card required &middot; 30-day trial
            </p>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-12 animate-fade-up">
            <div className="space-y-8">
              <h1 className="text-7xl xl:text-8xl font-bold leading-tight text-foreground">
                Your LLM Gateway, Simplified
              </h1>
              <p className="text-3xl text-muted-foreground max-w-2xl leading-relaxed">
                Zero Downtime, slash cost, boost performance, no hassle.
              </p>
            </div>

            <div className="space-y-4 max-w-2xl">
              <Button
                onClick={handleGetStarted}
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-8 py-4 rounded-xl text-lg h-14 min-w-[180px]"
              >
                Get Started Free
              </Button>
              <p className="text-sm text-muted-foreground">
                Free trial &middot; No credit card required &middot; 30-day trial
              </p>
            </div>
          </div>

          <div className="animate-fade-up-delay-1">
            <AnimatedBeamVisualization />
          </div>
        </div>
      </div>
    </section>
  );
};
