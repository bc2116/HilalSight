from datetime import timedelta


def test_best_time_tb_formula():
    # Tb = Ts + 4/9 * Lag
    ts = 0.0
    lag = 90.0  # minutes
    tb = ts + (4.0 / 9.0) * lag
    assert abs(tb - 40.0) < 1e-9

