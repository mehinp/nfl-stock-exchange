import sys
from pathlib import Path


def main():
    print("=" * 60)
    print("NFL SWING DETECTION SYSTEM")
    print("=" * 60)
    print("\nOptions:")
    print("  1. Train custom models from scratch")
    print("  2. Run live monitoring")
    print("  3. Setup API keys")
    print("  4. Exit")

    choice = input("\nEnter choice (1-4): ").strip()

    if choice == '1':
        print("\nStarting training pipeline...")
        print("This will take 15-30 minutes...")
        from training.train_custom_models import CustomSwingModelTrainer
        trainer = CustomSwingModelTrainer()
        trainer.train_complete_pipeline()

    elif choice == '2':
        models_dir = Path('models/pretrained')
        if not models_dir.exists() or not list(models_dir.glob('*.pkl')):
            print("\nERROR: Models not found!")
            print("Please train models first (Option 1)")
            return

        print("\nStarting live monitoring...")
        from inference.live_monitor import LiveSwingMonitor
        monitor = LiveSwingMonitor()
        monitor.monitor_all_live_games()

    elif choice == '3':
        from setup_api_keys import setup_api_keys
        setup_api_keys()

    elif choice == '4':
        print("Exiting...")
        sys.exit(0)

    else:
        print("Invalid choice")


if __name__ == "__main__":
    main()