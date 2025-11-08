import sys
sys.path.append('.')

from inference.live_monitor import LiveSwingMonitor

def main():
    print("Choose an option:")
    print("1) Train models")
    print("2) Offline game replay")
    print("3) Step replay")
    print("4) Live streaming monitor (ESPN)")
    choice = input("Enter 1-4: ").strip()

    if choice == "1":
        try:
            import scripts.train_models as train_models
            train_models.main()
        except Exception as e:
            print(f"Error: {e}")
    elif choice == "2":
        try:
            import scripts.game_replay as game_replay
            game_replay.main()
        except Exception as e:
            print(f"Error: {e}")
    elif choice == "3":
        try:
            import scripts.step_replay as step_replay
            step_replay.main()
        except Exception as e:
            print(f"Error: {e}")
    elif choice == "4":
        try:
            monitor = LiveSwingMonitor()
            monitor.run()
        except Exception as e:
            print(f"Error starting live monitor: {e}")
            import traceback
            traceback.print_exc()
    else:
        print("Invalid choice")

if __name__ == "__main__":
    main()