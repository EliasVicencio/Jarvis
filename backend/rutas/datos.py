"""Rutas de datos: historial de comandos, memoria semántica, recordatorios y notas rápidas.
CRUD simple, sin lógica propia — solo exponen lo que ya hace jarvis_core."""
from flask import Blueprint, request, jsonify
import jarvis_core

bp = Blueprint("datos", __name__)


@bp.route("/api/historial")
def api_historial():
    return jsonify({"historial": jarvis_core.obtener_historial()})


@bp.route("/api/memoria")
def api_memoria():
    return jsonify({"memoria": jarvis_core.obtener_memoria()})


@bp.route("/api/memoria/<int:indice>", methods=["DELETE"])
def api_memoria_eliminar(indice):
    memorias = jarvis_core.eliminar_memoria(indice)
    return jsonify({"memoria": memorias})


@bp.route("/api/recordatorios")
def api_recordatorios():
    return jsonify({"recordatorios": jarvis_core.obtener_recordatorios()})


@bp.route("/api/recordatorios", methods=["POST"])
def api_recordatorios_agregar():
    data = request.get_json(force=True) or {}
    texto = data.get("texto", "")
    recs = jarvis_core.agregar_recordatorio(texto)
    return jsonify({"recordatorios": recs})


@bp.route("/api/recordatorios/<int:indice>", methods=["DELETE"])
def api_recordatorios_eliminar(indice):
    recs = jarvis_core.eliminar_recordatorio(indice)
    return jsonify({"recordatorios": recs})


@bp.route("/api/notas-rapidas")
def api_notas_rapidas():
    return jsonify({"notas": jarvis_core.obtener_notas()})


@bp.route("/api/notas-rapidas/<int:indice>", methods=["DELETE"])
def api_notas_rapidas_eliminar(indice):
    notas = jarvis_core.eliminar_nota(indice)
    return jsonify({"notas": notas})