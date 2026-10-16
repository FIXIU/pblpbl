"""FastAPI Main Application Entry Point.

Sztuczny Dach / Coating Reflectivity Research Station.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router as api_router, set_app_context
from backend.api.websocket import ws_manager, ws_router
from backend.config import settings
from backend.hardware.max6675_driver import MAX6675Array
from backend.hardware.mlx90640_driver import MLX90640Driver, ROIConfig
from backend.hardware.ssr_controller import SSRController
from backend.services.experiment_manager import ExperimentManager
from backend.services.pid_controller import PIDController
from backend.services.safety_watchdog import SafetyWatchdog
from backend.services.session_logger import SessionLogger

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sztuczny_dach")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager: initializes hardware/simulation and background workers."""
    logger.info("Initializing Sztuczny Dach Station hardware & services...")
    logger.info(f"Simulation Mode: {settings.simulation_mode}")

    # 1. Initialize Actuators & Sensors
    ssr = SSRController(
        gpio_pin=settings.ssr_gpio_pin,
        pwm_window_sec=settings.ssr_pwm_window_sec,
        simulation_mode=settings.simulation_mode,
    )

    max6675_array = MAX6675Array(
        sensors_config=[
            {
                "name": "backplate_center",
                "spi_bus": settings.max6675_spi_bus,
                "spi_device": settings.max6675_spi_device,
            }
        ],
        simulation_mode=settings.simulation_mode,
    )

    default_roi = ROIConfig(
        x_min=settings.default_roi_x_min,
        x_max=settings.default_roi_x_max,
        y_min=settings.default_roi_y_min,
        y_max=settings.default_roi_y_max,
    )

    mlx90640 = MLX90640Driver(
        i2c_bus=settings.mlx90640_i2c_bus,
        i2c_addr=settings.mlx90640_i2c_addr,
        fps=settings.mlx90640_fps,
        roi=default_roi,
        simulation_mode=settings.simulation_mode,
    )

    # 2. Initialize Controllers & Safety Services
    pid = PIDController(kp=3.5, ki=0.08, kd=2.0, setpoint=60.0)

    watchdog = SafetyWatchdog(
        max_back_temp=settings.safety_max_back_temp,
        max_surf_temp=settings.safety_max_surf_temp,
        disconnect_timeout_sec=settings.safety_disconnect_timeout_sec,
    )

    session_logger = SessionLogger(data_dir=settings.resolved_data_dir)

    # 3. Create Central Experiment Manager
    experiment_manager = ExperimentManager(
        ssr=ssr,
        max6675_array=max6675_array,
        mlx90640=mlx90640,
        pid=pid,
        watchdog=watchdog,
        logger_service=session_logger,
    )

    # Register WebSocket broadcasting callback
    experiment_manager.register_telemetry_callback(ws_manager.broadcast)

    # Store in dependency container
    app_context = {
        "ssr": ssr,
        "max6675": max6675_array,
        "mlx90640": mlx90640,
        "pid": pid,
        "watchdog": watchdog,
        "session_logger": session_logger,
        "experiment_manager": experiment_manager,
    }
    set_app_context(app_context)

    # Start 4 Hz background loop
    await experiment_manager.start()
    logger.info("Sztuczny Dach Station is READY.")

    yield

    # Shutdown
    logger.info("Shutting down Sztuczny Dach Station...")
    await experiment_manager.stop()
    ssr.close()
    max6675_array.close()
    mlx90640.close()
    logger.info("Shutdown complete.")


app = FastAPI(
    title="Sztuczny Dach - Coating Reflectivity Testbed",
    description="Research Station for testing high-reflectivity roof coatings on Raspberry Pi 5",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for Next.js frontend (local dev & network smartphones)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permits access from any lab smartphone/laptop on LAN
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount REST API and WebSocket routes
app.include_router(api_router)
app.include_router(ws_router)


@app.get("/")
async def root():
    return {
        "name": "Sztuczny Dach - Coating Reflectivity Research Station",
        "status": "online",
        "docs": "/docs",
        "telemetry_ws": "/ws/telemetry",
    }
