#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State};

struct FlaskProcess(Mutex<Option<Child>>);

fn iniciar_flask() -> Option<Child> {
    let python = if cfg!(target_os = "windows") { "python" } else { "python3" };

    // current_dir() apunta a la raíz del proyecto cuando se lanza con `npm run dev`
    // El backend está en <raiz>/backend/app.py
    let raiz = std::env::current_dir().ok()?;
    
    // Intentar ruta directa primero
    let ruta1 = raiz.join("backend").join("app.py");
    // Si no, subir un nivel (por si acaso)
    let ruta2 = raiz.join("..").join("backend").join("app.py");

    let backend_path = if ruta1.exists() {
        ruta1
    } else if ruta2.exists() {
        ruta2
    } else {
        eprintln!("No se encontró backend/app.py en {:?}", raiz);
        return None;
    };

    eprintln!("Iniciando Flask desde: {:?}", backend_path);

    // Activar el venv si existe
    let venv_python_win = raiz.join("backend").join("venv").join("Scripts").join("python.exe");
    let venv_python_unix = raiz.join("backend").join("venv").join("bin").join("python");

    let python_exe = if venv_python_win.exists() {
        venv_python_win.to_string_lossy().to_string()
    } else if venv_python_unix.exists() {
        venv_python_unix.to_string_lossy().to_string()
    } else {
        python.to_string()
    };

    eprintln!("Usando Python: {}", python_exe);

    let child = Command::new(&python_exe)
        .arg(&backend_path)
        .current_dir(backend_path.parent()?)
        .spawn()
        .ok()?;

    std::thread::sleep(std::time::Duration::from_millis(2000));
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
                let child = state.0.lock().unwrap().take();
                if let Some(mut c) = child {
                    let _ = c.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Error al iniciar Jarvis");
}