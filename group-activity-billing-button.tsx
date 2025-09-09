"use client"

import { useState } from "react"
import { FileText, AlertTriangle, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { GroupActivityBillingModal } from "./group-activity-billing-modal"
import type { GroupActivity } from "@/app/contexts/group-activities-context"

interface GroupActivityBillingButtonProps {
  activity: GroupActivity
  onBillingComplete?: () => void
  organizationId: number
  services?: any[]
}

export function GroupActivityBillingButton({
  activity,
  onBillingComplete,
  organizationId,
  services = [],
}: GroupActivityBillingButtonProps) {
  const [showBillingModal, setShowBillingModal] = useState(false)

  // Validar si tiene servicio asociado
  const hasService = activity.service_id && services.find((s) => s.id === activity.service_id)
  const service = services.find((s) => s.id === activity.service_id)

  // Obtener participantes válidos para facturación (attended + registered)
  const validParticipants =
    activity.participants?.filter((p) => p.status === "attended" || p.status === "registered") || []

  // Función de validación
const validateParticipantData = (participant: any) => {
  const client = participant.client

  if (!client) {
    return { isValid: false, missingFields: ["Cliente completo"] }
  }

  const missingFields: string[] = []

  // Nombre + apellidos
  if (!client.name?.trim()) {
    missingFields.push("Nombre")
  } else {
    const nameParts = client.name.trim().split(/\s+/)
    if (nameParts.length < 2) {
      missingFields.push("Apellidos (nombre y apellidos requeridos)")
    }
  }

  // CIF/NIF
  if (!(client as any).tax_id?.trim()) {
    missingFields.push("CIF/NIF")
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  }
}


  // Contar participantes con datos completos
  const participantsWithCompleteData = validParticipants.filter((p) => {
    const validation = validateParticipantData(p)
    return validation.isValid
  })

  const handleBillingComplete = () => {
    setShowBillingModal(false)
    if (onBillingComplete) {
      onBillingComplete()
    }
  }

  // Si no hay servicio
  if (!hasService) {
    return (
      <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          <span>Sin servicio asociado</span>
        </div>
      </div>
    )
  }

  // Si no hay participantes válidos
  if (validParticipants.length === 0) {
    return (
      <div className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          <span>Sin participantes para facturar</span>
        </div>
      </div>
    )
  }

  // Si ningún participante tiene datos completos
  if (participantsWithCompleteData.length === 0) {
    return (
      <div className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200">
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          <span>Participantes sin datos completos</span>
        </div>
        <div className="text-xs mt-1">
          {validParticipants.length} participante{validParticipants.length !== 1 ? "s" : ""} registrado
          {validParticipants.length !== 1 ? "s" : ""}
        </div>
        <div className="text-xs mt-1 text-red-700">
          {validParticipants.map((p, index) => {
            const validation = validateParticipantData(p)
            return (
              <div key={index}>
                {p.client?.name}: {validation.missingFields.join(", ")}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Botón habilitado
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowBillingModal(true)}
        className="gap-2 text-green-600 hover:text-green-700 hover:bg-green-50 bg-transparent"
      >
        <FileText className="h-4 w-4" />
        <span>Facturar Actividad</span>
        <Badge variant="secondary" className="ml-1 bg-green-100 text-green-800">
          {participantsWithCompleteData.length}
        </Badge>
      </Button>

      {showBillingModal && (
        <GroupActivityBillingModal
          isOpen={showBillingModal}
          onClose={() => setShowBillingModal(false)}
          activity={activity}
          service={service}
          organizationId={organizationId}
          onBillingComplete={handleBillingComplete}
        />
      )}
    </>
  )
}
