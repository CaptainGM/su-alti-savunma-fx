"""Yeni haritaların yol ve kule yerleri (export_js.py tarafından maps.js'e yazılır)."""
import atlantis
import ice
import mangrove
import specs as S
import volcano


def registry():
    return {
        'buz': ([S.ICE_PATH], ice.SPOTS),
        'volkan': ([S.VOLCANO_PATH], volcano.SPOTS),
        'atlantis': ([S.ATLANTIS_PATH], atlantis.SPOTS),
        'mangrov': ([S.MANGROVE_LEFT, S.MANGROVE_MID, S.MANGROVE_RIGHT], mangrove.SPOTS),
    }
