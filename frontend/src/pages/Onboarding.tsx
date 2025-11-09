import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  ShieldCheck,
  Sparkles,
  Timer,
  Waves,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { authSession, loginUser, signupUser } from "@/lib/api";
import { useLocation } from "wouter";

type AuthMode = "signup" | "login";

const highlightStats = [
  { label: "Funding ready", value: "< 3 min", accent: "avg onboarding" },
  { label: "Verified beta traders", value: "12,431", accent: "+312 today" },
  { label: "Live franchises", value: "32 teams", accent: "real quotes" },
] as const;

const onboardingSteps: Array<{
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
}> = [
  {
    title: "Create your locker",
    description:
      "Reserve your handle, verify email, and choose a secure password.",
    accent: "Step 1",
    icon: Sparkles,
  },
  {
    title: "Secure credentials",
    description:
      "Enable passkeys + 2FA so your roster stays protected all season.",
    accent: "Step 2",
    icon: ShieldCheck,
  },
  {
    title: "Fund the playbook",
    description:
      "Drop in your initial deposit to unlock instant trading power.",
    accent: "Step 3",
    icon: Coins,
  },
];

const safetyChecklist = [
  "256-bit encryption & passkey support",
  "FDIC-backed treasury partners",
  "SOC2-aligned audit logging",
];

const initialSignUpState = {
  email: "",
  password: "",
  confirmPassword: "",
  deposit: "5000",
};

const initialLoginState = {
  email: "",
  password: "",
};

export default function Onboarding() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [signUpForm, setSignUpForm] = useState(initialSignUpState);
  const [loginForm, setLoginForm] = useState(initialLoginState);
  const [signUpMessage, setSignUpMessage] = useState<string | null>(null);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [signUpLoading, setSignUpLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    const session = authSession.getUser();
    if (session) {
      navigate("/dashboard");
    }
  }, [navigate]);

  const handleSignUpChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setSignUpForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLoginChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setLoginForm((prev) => ({ ...prev, [name]: value }));
  };

  const validateEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

  const handleSignUpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignUpMessage(null);

    if (!validateEmail(signUpForm.email)) {
      setSignUpMessage("Please enter a valid email address.");
      return;
    }

    if (signUpForm.password.length < 8) {
      setSignUpMessage("Password must be at least 8 characters long.");
      return;
    }

    if (signUpForm.password !== signUpForm.confirmPassword) {
      setSignUpMessage("Passwords do not match.");
      return;
    }

    const depositValue = Number(signUpForm.deposit);
    if (!Number.isFinite(depositValue) || depositValue < 0) {
      setSignUpMessage("Initial deposit must be 0 or greater.");
      return;
    }

    try {
      setSignUpLoading(true);
      await signupUser({
        email: signUpForm.email,
        password: signUpForm.password,
        confirm_password: signUpForm.confirmPassword,
        balance: depositValue,
      });
      setSignUpMessage("Looks great! Redirecting you to your dashboard...");
      setTimeout(() => navigate("/dashboard"), 600);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign up right now.";
      setSignUpMessage(message);
    } finally {
      setSignUpLoading(false);
    }
  };

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginMessage(null);

    if (!validateEmail(loginForm.email)) {
      setLoginMessage("Please enter a valid email address.");
      return;
    }

    if (!loginForm.password) {
      setLoginMessage("Password is required.");
      return;
    }

    try {
      setLoginLoading(true);
      await loginUser({
        email: loginForm.email,
        password: loginForm.password,
      });
      setLoginMessage("Hang tight! Logging you in...");
      setTimeout(() => navigate("/dashboard"), 400);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to log in.";
      setLoginMessage(message);
    } finally {
      setLoginLoading(false);
    }
  };

  const heroStats = useMemo(
    () => [
      { label: "Avg. Daily Volume", value: "$4.2M" },
      { label: "Flash Picks Filled", value: "184" },
      { label: "Stadiums Tuned In", value: "18 cities" },
    ],
    []
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-background pt-6 text-foreground dark:bg-gradient-to-b dark:from-[#040510] dark:via-background dark:to-background">
      <div className="pointer-events-none absolute -top-32 left-1/2 hidden h-96 w-96 -translate-x-1/2 rounded-full bg-primary/30 blur-3xl dark:block" />
      <div className="pointer-events-none absolute bottom-0 right-0 hidden h-[28rem] w-[28rem] translate-x-20 rounded-full bg-purple-500/20 blur-3xl dark:block" />
      <div className="pointer-events-none absolute inset-0 hidden opacity-30 [mask-image:radial-gradient(circle_at_center,white,transparent_70%)] dark:block">
        <div className="h-full w-full bg-[linear-gradient(115deg,rgba(148,163,184,0.08)_0%,rgba(15,23,42,0)_45%,rgba(59,130,246,0.15)_100%)]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col px-4 sm:px-6 lg:px-12">
        <header className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-white/80 px-4 py-6 text-sm text-muted-foreground shadow-sm backdrop-blur dark:border-transparent dark:bg-transparent sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-[0.7rem]">
              <Sparkles className="h-3 w-3 text-primary" />
              Season 2025 Beta
            </span>
            <span className="hidden lg:inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-[0.7rem]">
              <Timer className="h-3 w-3 text-primary" />
              Market hours 9a - 1a ET
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="hidden sm:inline text-muted-foreground">
              Darkroom / Lightbox
            </span>
            <ThemeToggle />
          </div>
        </header>

        <main className="mt-6 flex flex-1 flex-col gap-10 pb-12 lg:flex-row lg:items-center">
          <section className="flex-1 space-y-10">
            <div className="space-y-6">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                NFLXchange
                <span className="h-px w-8 bg-primary/60" />
                Public beta
              </p>
              <h1 className="text-4xl font-bold leading-tight text-foreground md:text-5xl lg:text-6xl">
                A cinematic launchpad
                <span className="text-primary"> for NFL stock traders.</span>
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground md:text-lg">
                Craft your trading persona, drop your first deposit, and watch a
                live market made entirely of franchises pulse across the board. The
                faster you onboard, the sooner you can call the shots.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {highlightStats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex min-w-[10rem] flex-1 flex-col rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur"
                >
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </span>
                  <span className="text-2xl font-semibold">{stat.value}</span>
                  <span className="text-xs text-primary">{stat.accent}</span>
                </div>
              ))}
            </div>

            <div className="grid gap-4 rounded-3xl border border-border/60 bg-card/40 p-6 backdrop-blur lg:grid-cols-3">
              {heroStats.map((stat) => (
                <div key={stat.label} className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-semibold">{stat.value}</p>
                  <div className="h-px w-full bg-gradient-to-r from-primary/50 via-transparent to-transparent" />
                </div>
              ))}
            </div>

            <div className="grid gap-4 rounded-3xl border border-border/40 bg-card/30 p-6 backdrop-blur lg:grid-cols-3">
              {onboardingSteps.map((step) => (
                <div key={step.title} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl border border-border/60 bg-card/70 p-3">
                      <step.icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xs uppercase tracking-wide text-primary">
                      {step.accent}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="w-full max-w-md space-y-6">
            <div className="relative">
              <div className="pointer-events-none absolute -inset-[1px] hidden rounded-[1.75rem] bg-gradient-to-r from-primary/60 via-purple-500/40 to-primary/60 blur dark:block" />
              <Card className="relative rounded-[1.75rem] border border-border/70 bg-white shadow-2xl backdrop-blur dark:bg-[#0B0E1D]/90">
                <CardHeader className="space-y-1 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-2xl font-bold">Claim your locker</CardTitle>
                  <CardDescription>
                    Switch between sign up and log in—no backend wiring required yet.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs
                    value={mode}
                    onValueChange={(value) => setMode(value as AuthMode)}
                    className="w-full"
                  >
                    <TabsList className="grid w-full grid-cols-2 rounded-full bg-muted/20 p-1">
                      <TabsTrigger value="signup" className="rounded-full">
                        Sign Up
                      </TabsTrigger>
                      <TabsTrigger value="login" className="rounded-full">
                        Log In
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="signup" className="mt-6">
                      <form className="space-y-4" onSubmit={handleSignUpSubmit}>
                        <div className="space-y-2">
                          <Label htmlFor="signup-email">Email</Label>
                          <Input
                            id="signup-email"
                            name="email"
                            type="email"
                            placeholder="you@example.com"
                            value={signUpForm.email}
                            onChange={handleSignUpChange}
                            autoComplete="email"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="signup-password">Password</Label>
                          <Input
                            id="signup-password"
                            name="password"
                            type="password"
                            placeholder="Minimum 8 characters"
                            value={signUpForm.password}
                            onChange={handleSignUpChange}
                            autoComplete="new-password"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="signup-confirm-password">
                            Confirm password
                          </Label>
                          <Input
                            id="signup-confirm-password"
                            name="confirmPassword"
                            type="password"
                            placeholder="Retype your password"
                            value={signUpForm.confirmPassword}
                            onChange={handleSignUpChange}
                            autoComplete="new-password"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="signup-deposit">Initial deposit (USD)</Label>
                            <span className="text-xs text-muted-foreground">Min $100</span>
                          </div>
                          <Input
                            id="signup-deposit"
                            name="deposit"
                            type="number"
                            min={100}
                            step={50}
                            value={signUpForm.deposit}
                            onChange={handleSignUpChange}
                            placeholder="5000"
                            inputMode="decimal"
                            required
                          />
                        </div>

                        {signUpMessage && (
                          <p
                            className={cn(
                              "rounded-md border px-3 py-2 text-sm",
                              signUpMessage.startsWith("Looks")
                                ? "border-success/40 bg-success/10 text-success"
                                : "border-destructive/40 bg-destructive/10 text-destructive",
                            )}
                          >
                            {signUpMessage}
                          </p>
                        )}

                        <Button type="submit" className="w-full gap-2" disabled={signUpLoading}>
                          {signUpLoading ? "Creating account..." : "Create account"}
                          <ArrowRight className="h-4 w-4" />
                        </Button>

                        <p className="text-center text-xs text-muted-foreground">
                          By continuing you agree to the Terms of Service & Privacy Policy.
                        </p>
                      </form>
                    </TabsContent>

                    <TabsContent value="login" className="mt-6">
                      <form className="space-y-4" onSubmit={handleLoginSubmit}>
                        <div className="space-y-2">
                          <Label htmlFor="login-email">Email</Label>
                          <Input
                            id="login-email"
                            name="email"
                            type="email"
                            placeholder="you@example.com"
                            value={loginForm.email}
                            onChange={handleLoginChange}
                            autoComplete="email"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="login-password">Password</Label>
                          <Input
                            id="login-password"
                            name="password"
                            type="password"
                            placeholder="********"
                            value={loginForm.password}
                            onChange={handleLoginChange}
                            autoComplete="current-password"
                            required
                          />
                        </div>

                        {loginMessage && (
                          <p
                            className={cn(
                              "rounded-md border px-3 py-2 text-sm",
                              loginMessage.startsWith("Hang")
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-destructive/40 bg-destructive/10 text-destructive",
                            )}
                          >
                            {loginMessage}
                          </p>
                        )}

                        <Button type="submit" className="w-full gap-2" disabled={loginLoading}>
                          {loginLoading ? "Signing in..." : "Log in"}
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </form>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>

            <Card className="border border-border/50 bg-card/70 p-4 backdrop-blur">
              <div className="flex items-start gap-3">
                <Waves className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Safety net locked in</p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {safetyChecklist.map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
}
