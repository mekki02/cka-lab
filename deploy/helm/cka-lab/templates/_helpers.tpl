{{/* Resource name prefix: <release>-cka-lab, or just <release> if it already contains the chart name. */}}
{{- define "cka.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 50 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 50 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "cka.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
app.kubernetes.io/part-of: cka-lab
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* Selector labels for a component: (dict "ctx" $ "component" "ms-identity") */}}
{{- define "cka.selector" -}}
app.kubernetes.io/name: {{ .component }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
{{- end -}}

{{- define "cka.image" -}}
{{- printf "%s/%s:%s" .ctx.Values.image.registry .component (default .ctx.Chart.AppVersion .ctx.Values.image.tag) -}}
{{- end -}}

{{- define "cka.dbSecretName" -}}
{{- default (printf "%s-postgresql" (include "cka.fullname" .)) .Values.postgresql.existingSecret -}}
{{- end -}}

{{- define "cka.jwtSecretName" -}}
{{- default (printf "%s-jwt" (include "cka.fullname" .)) .Values.jwt.existingSecret -}}
{{- end -}}

{{- define "cka.dbHost" -}}
{{- if .Values.postgresql.enabled -}}
{{- printf "%s-postgresql" (include "cka.fullname" .) -}}
{{- else -}}
{{- required "externalDatabase.host is required when postgresql.enabled=false" .Values.externalDatabase.host -}}
{{- end -}}
{{- end -}}

{{/* Hardened container defaults shared by every app container. */}}
{{- define "cka.containerSecurity" -}}
securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
{{- end -}}

{{/* Database env for a service: (dict "ctx" $ "svc" "identity") */}}
{{- define "cka.dbEnv" -}}
{{- $v := .ctx.Values -}}
- name: DATABASE_HOST
  value: {{ include "cka.dbHost" .ctx | quote }}
- name: DATABASE_PORT
  value: {{ ternary "5432" (toString $v.externalDatabase.port) $v.postgresql.enabled | quote }}
{{- if $v.postgresql.enabled }}
- name: DATABASE_NAME
  value: {{ .svc }}
- name: DATABASE_USER
  value: {{ .svc }}
- name: DATABASE_SSL
  value: "false"
- name: DATABASE_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "cka.dbSecretName" .ctx }}
      key: {{ .svc }}-password
{{- else }}
{{- $db := index $v.externalDatabase .svc }}
- name: DATABASE_NAME
  value: {{ $db.database | quote }}
- name: DATABASE_USER
  value: {{ $db.user | quote }}
- name: DATABASE_SSL
  value: {{ $v.externalDatabase.ssl | quote }}
- name: DATABASE_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ required (printf "externalDatabase.%s.existingSecret is required" .svc) $db.existingSecret }}
      key: {{ $db.passwordKey }}
{{- end }}
{{- end -}}
