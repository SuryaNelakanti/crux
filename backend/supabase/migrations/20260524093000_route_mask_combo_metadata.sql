-- Add first-class storage for ML combo route-mask metadata.

alter table public.route_masks
    add column if not exists metadata_json jsonb;

alter table public.route_masks
    drop constraint if exists route_masks_method_check;

alter table public.route_masks
    add constraint route_masks_method_check
    check (
        method in (
            'auto',
            'color-dominant',
            'manual-edit',
            'seed-color',
            'ml-yolo26-seg',
            'ml-combo-v1'
        )
    );
