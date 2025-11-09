import { Fragment, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Timer } from "lucide-react";
import type { LivePlay } from "@/hooks/useLivePlayStream";
import { cn } from "@/lib/utils";

interface FlashPickShowcaseProps {
  play?: LivePlay;
  homeTeam?: string | null;
  awayTeam?: string | null;
}

const formatTimer = (seconds?: number | null) => {
  if (typeof seconds !== "number") return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const FLASH_WINDOW_DURATION = 30;

export default function FlashPickShowcase({ play, homeTeam, awayTeam }: FlashPickShowcaseProps) {
  const isFourthQuarter = (play?.qtr ?? 0) >= 4;
  const flashTrigger = Boolean(play?.flashEvent);
  const [eventActive, setEventActive] = useState(false);
  const [screenPulse, setScreenPulse] = useState(false);
  const [buttonShake, setButtonShake] = useState(false);
  const [windowSeconds, setWindowSeconds] = useState<number | null>(null);
  const [betPlaced, setBetPlaced] = useState(false);
  const shakeTimeout = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  useEffect(() => {
    if (!flashTrigger) return;
    setEventActive(true);
    setScreenPulse(true);

    const pulseTimer = window.setTimeout(() => setScreenPulse(false), 900);
    const eventTimer = window.setTimeout(() => setEventActive(false), 10000);

    return () => {
      window.clearTimeout(pulseTimer);
      window.clearTimeout(eventTimer);
    };
  }, [flashTrigger]);

  useEffect(() => {
    if (countdownRef.current) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    if (!eventActive) {
      setWindowSeconds(null);
      return;
    }

    setWindowSeconds(FLASH_WINDOW_DURATION);
    countdownRef.current = window.setInterval(() => {
      setWindowSeconds((prev) => {
        if (prev === null) return prev;
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        window.clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [eventActive]);

  useEffect(() => {
    if (windowSeconds === 0 && countdownRef.current) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, [windowSeconds]);

  useEffect(() => {
    const triggerShake = () => {
      setButtonShake(true);
      if (shakeTimeout.current) window.clearTimeout(shakeTimeout.current);
      shakeTimeout.current = window.setTimeout(() => setButtonShake(false), 600);
    };
    const intervalId = window.setInterval(triggerShake, 10000);
    return () => {
      window.clearInterval(intervalId);
      if (shakeTimeout.current) {
        window.clearTimeout(shakeTimeout.current);
      }
    };
  }, []);

  const secondsRemaining = play?.game_seconds_remaining ?? null;
  const inPlayWindow = Math.min(Math.max(secondsRemaining ?? 120, 0), 120);
  const timerValue = windowSeconds ?? FLASH_WINDOW_DURATION;
  const windowProgress = eventActive ? 1 - timerValue / FLASH_WINDOW_DURATION : 1 - inPlayWindow / 120;
  const discountPercent = isFourthQuarter ? Math.round(10 + windowProgress * 25) : 0;
  const boostedOdds = isFourthQuarter ? "-105" : "-120";
  const featuredTeam = homeTeam ?? play?.posteam ?? "HOME";
  const challengerTeam = awayTeam ?? play?.defteam ?? "AWAY";
  const matchupLabel = `${challengerTeam} @ ${featuredTeam}`;
  const rewardShare = 0.25;

  const betEnabled = Boolean(eventActive && isFourthQuarter && (windowSeconds ?? 0) > 0);

  const gradientShellClass = cn(
    "relative rounded-[28px] p-[1.5px] bg-gradient-to-r from-indigo-500/70 via-blue-500/70 to-purple-600/70 shadow-xl transition-shadow duration-500",
    eventActive && "ring-2 ring-sky-400/40 shadow-[0_0_42px_rgba(14,165,233,0.45)]",
  );
  const buttonShellClass = "rounded-[18px] p-[1px] bg-gradient-to-r from-indigo-500/60 via-purple-500/60 to-sky-500/60";

  const formattedLimitedTime =
    windowSeconds === null
      ? eventActive
        ? formatTimer(FLASH_WINDOW_DURATION)
        : "Awaiting window"
      : formatTimer(windowSeconds);

  const limitedBarWidth =
    windowSeconds === null || !eventActive
      ? 0
      : Math.max((windowSeconds / FLASH_WINDOW_DURATION) * 100, 0);

  const handleBetClick = () => {
    if (!betEnabled) return;
    setBetPlaced(true);
    window.setTimeout(() => setBetPlaced(false), 1800);
  };

  return (
    <Fragment>
      {screenPulse && (
        <div className="fixed inset-0 z-40 pointer-events-none bg-indigo-200/60 mix-blend-screen animate-screen-flash" />
      )}
      {betPlaced && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030712]/90 backdrop-blur-sm text-white bet-placed-overlay">
          <div className="text-center space-y-3">
            <p className="text-xs uppercase tracking-[0.5em] text-sky-300">Confirmed</p>
            <p className="text-3xl font-semibold">Bet placed</p>
            <p className="text-sm text-white/70">Fractional reward locked in for {featuredTeam}</p>
          </div>
        </div>
      )}
      <div className={gradientShellClass}>
        <Card className="rounded-[26px] bg-[#05050c] border border-white/10 text-white space-y-5 p-6">
          <div className="flex items-center gap-2 uppercase tracking-[0.3em] text-sm text-white/80">
            <Sparkles className="w-4 h-4" />
            Flash Pick
            {isFourthQuarter && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-0.5 text-[10px] tracking-widest text-white">
                <Timer className="h-3 w-3" /> 4Q BOOST
              </span>
            )}
          </div>

          {eventActive && (
            <div className="relative overflow-hidden rounded-2xl border border-sky-400/40 bg-gradient-to-r from-[#11172a] via-[#080b13] to-[#11172a] p-4 text-center shadow-[0_15px_45px_rgba(15,23,42,0.55)]">
              <div className="absolute inset-0 bg-gradient-to-r from-sky-500/15 via-transparent to-purple-500/15" />
              <div className="relative space-y-1">
                <p className="text-xs uppercase tracking-[0.4em] text-sky-300">Live Game Flash Bet</p>
                <p className="text-lg font-semibold text-white">{matchupLabel}</p>
                <p className="text-sm text-white/75">
                  Quick window to bet the actual drive outcome. Lock odds before traders re-price the spread.
                </p>
                <span className="inline-flex items-center justify-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  Reward: +{rewardShare} fractional share of {featuredTeam}
                </span>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-white/10 border border-white/20 p-4 grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-sm text-white/70">Away</p>
              <p className="text-2xl font-semibold">{challengerTeam}</p>
              <p className="text-lg font-mono">{play?.away_score ?? "--"} pts</p>
            </div>
            <div>
              <p className="text-sm text-white/70">Home</p>
              <p className="text-2xl font-semibold">{featuredTeam}</p>
              <p className="text-lg font-mono">{play?.home_score ?? "--"} pts</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-white/80">
              <span>{isFourthQuarter ? "Limited window" : "Boost unlocks"}</span>
              <span>{isFourthQuarter ? formattedLimitedTime : "start of Q4"}</span>
            </div>
            <div className="h-2 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-white/80 rounded-full transition-all"
                style={{
                  width: `${isFourthQuarter ? limitedBarWidth : 0}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/25 bg-white/10 p-4 text-center space-y-1">
            <p className="text-xs uppercase tracking-[0.4em] text-white/70">Clutch Offer</p>
            <p className="text-2xl font-semibold">
              {isFourthQuarter ? `${discountPercent}% vig slash` : "Locked until crunch time"}
            </p>
            <p className="text-sm text-white/80">
              {isFourthQuarter
                ? `Take ${featuredTeam} -2.5 @ ${boostedOdds}`
                : "Keep an eye on the scoreboard for the next boost."}
            </p>
          </div>

          <div className={buttonShellClass}>
            <Button
              className={cn(
                "w-full h-12 rounded-[16px] bg-[#05050c] text-white border border-white/5 hover:bg-[#0c0e18] transition",
                buttonShake && "animate-bet-shake",
                )}
              onClick={handleBetClick}
              disabled={!betEnabled}
            >
              {betEnabled ? `Back ${featuredTeam} now` : eventActive ? "Window closed" : "Boost locked"}
            </Button>
          </div>
          <p className="text-xs text-white/70 text-center">
            {isFourthQuarter
              ? "Discounted price disappears when the timer hits zero."
              : "Flash pick turns on automatically once the 4th quarter starts."}
          </p>
        </Card>
      </div>
    </Fragment>
  );
}
