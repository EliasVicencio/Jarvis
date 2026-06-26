#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State};

struct FlaskProcess(Mutex<Option<Child>>);

fn iniciar_flask() -> Option<Child> {
    let python = if cfg!(target_os = "windows") { "python" } else { "python3" };

    let backend_dev = std::env::current_dir()
        .ok()?
        .join("backend")
        .join("app.py");

    let child = Command::new(python)
        .arg(backend_dev)
        .spawn()
        .ok()?;

    std::thread::sleep(std::time::Duration::from_millis(1500));
    Some(child)
}

fn main() {
    tauri::Builder::default()
        .manage(FlaskProcess(Mutex::new(None)))
        .setup(|app| {
            let flask = iniciar_flask();
            let state: State<FlaskProcess> = app.state();
            *state.0.lock().unwrap() = flask;
            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::Destroyed = event.event() {
                let state: State<FlaskProcess> = event.window().state();
                // Fix: extraer el child antes de que el MutexGuard se libere
                let child = state.0.lock().unwrap().take();
                if let Some(mut c) = child {
                    let _ = c.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Error al iniciar Jarvis");
}