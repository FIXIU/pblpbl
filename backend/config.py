"""Configuration module for the Coating Reflectivity Research Station."""

import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator


# Find repository root directory
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_PATH if ENV_PATH.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Operational Mode
    simulation_mode: bool = Field(default=True, alias="SIMULATION_MODE")

    # Server Configuration
    backend_host: str = Field(default="0.0.0.0", alias="BACKEND_HOST")
    backend_port: int = Field(default=8000, alias="BACKEND_PORT")
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000,http://0.0.0.0:3000",
        alias="CORS_ORIGINS",
    )

    # SSR Relay (SSR-40DA)
    ssr_gpio_pin: int = Field(default=18, alias="SSR_GPIO_PIN")
    ssr_pwm_window_sec: float = Field(default=2.0, alias="SSR_PWM_WINDOW_SEC")

    # MAX6675 Thermocouple (SPI0)
    max6675_spi_bus: int = Field(default=0, alias="MAX6675_SPI_BUS")
    max6675_spi_device: int = Field(default=0, alias="MAX6675_SPI_DEVICE")
    max6675_poll_rate_hz: float = Field(default=4.0, alias="MAX6675_POLL_RATE_HZ")

    # MLX90640 Thermal Camera (I2C1)
    mlx90640_i2c_bus: int = Field(default=1, alias="MLX90640_I2C_BUS")
    mlx90640_i2c_addr: int = Field(default=0x33, alias="MLX90640_I2C_ADDR")

    @field_validator("mlx90640_i2c_addr", mode="before")
    @classmethod
    def parse_hex_or_int(cls, v):
        if isinstance(v, str):
            return int(v, 0)
        return v

    mlx90640_fps: int = Field(default=4, alias="MLX90640_FPS")

    # Default Plate ROI (32x24 grid: x: 0..31, y: 0..23)
    default_roi_x_min: int = Field(default=8, alias="DEFAULT_ROI_X_MIN")
    default_roi_x_max: int = Field(default=24, alias="DEFAULT_ROI_X_MAX")
    default_roi_y_min: int = Field(default=6, alias="DEFAULT_ROI_Y_MIN")
    default_roi_y_max: int = Field(default=18, alias="DEFAULT_ROI_Y_MAX")

    # Safety Watchdog Thresholds
    safety_max_back_temp: float = Field(default=110.0, alias="SAFETY_MAX_BACK_TEMP")
    safety_max_surf_temp: float = Field(default=120.0, alias="SAFETY_MAX_SURF_TEMP")
    safety_disconnect_timeout_sec: float = Field(
        default=1.5, alias="SAFETY_DISCONNECT_TIMEOUT_SEC"
    )

    # Anti-Glare Snapshot Mode
    anti_glare_default_interval_sec: float = Field(
        default=30.0, alias="ANTI_GLARE_DEFAULT_INTERVAL_SEC"
    )
    anti_glare_cooldown_sec: float = Field(default=1.5, alias="ANTI_GLARE_COOLDOWN_SEC")

    # Data Storage
    data_dir: str = Field(default="backend/data/sessions", alias="DATA_DIR")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def resolved_data_dir(self) -> Path:
        p = Path(self.data_dir)
        if not p.is_absolute():
            p = BASE_DIR / p
        p.mkdir(parents=True, exist_ok=True)
        return p


settings = Settings()
